import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, isNotNull } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, sessions, oauthClients, oauthTokens } from '$lib/server/schema';

const DB_NAME = 'test_token_security';
let dbUrl: string;
let userId: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', async () => {
		const schema = await vi.importActual<typeof import('$lib/server/schema')>('$lib/server/schema');
		return { getDB: () => db, ...schema };
	});
	vi.doMock('$lib/server/env', () => ({ config: { session: { secret: 'test-secret' } } }));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(oauthTokens);
	await db.delete(sessions);
	await db.delete(oauthClients);
	await db.delete(users);
	const [user] = await db
		.insert(users)
		.values({ email: 'tokens@example.com', name: 'Tokens', locale: 'en' })
		.returning();
	userId = user.id;
	await db.insert(oauthClients).values({
		clientId: 'third-party',
		clientName: 'Third party',
		tokenEndpointAuthMethod: 'none',
		allowedRedirectUris: []
	});
	await db.insert(oauthClients).values({
		clientId: 'bissbilanz-mobile',
		clientName: 'Mobile',
		tokenEndpointAuthMethod: 'none',
		allowedRedirectUris: []
	});
});

describe('refresh token rotation', () => {
	it('claims the token once when several refreshes race, and answers the losers in the grace window', async () => {
		const { createAccessToken, refreshAccessToken } = await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'third-party');

		const results = await Promise.all(
			Array.from({ length: 8 }, () => refreshAccessToken(refreshToken, 'third-party'))
		);

		expect(results.every(Boolean)).toBe(true);
		const rows = await getTestDB(dbUrl).select().from(oauthTokens);
		expect(rows.filter((r) => r.refreshTokenConsumedAt)).toHaveLength(1);
		expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
	});

	it('rejects an unknown refresh token without touching anything', async () => {
		const { createAccessToken, refreshAccessToken } = await import('$lib/server/oauth');
		await createAccessToken(userId, 'third-party');

		expect(await refreshAccessToken('nope', 'third-party')).toBeUndefined();
		expect(await getTestDB(dbUrl).select().from(oauthTokens)).toHaveLength(1);
	});

	it('keeps the family and its absolute expiry through rotation', async () => {
		const { createAccessToken, refreshAccessToken } = await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'third-party');
		const db = getTestDB(dbUrl);
		const [before] = await db.select().from(oauthTokens);

		await refreshAccessToken(refreshToken, 'third-party');

		const [after] = (await db.select().from(oauthTokens)).filter((r) => !r.refreshTokenConsumedAt);
		expect(after.familyId).toBe(before.familyId);
		expect(after.familyExpiresAt!.getTime()).toBe(before.familyExpiresAt!.getTime());
		expect(after.id).not.toBe(before.id);
	});

	it('stops rotating once the family lifetime is over', async () => {
		const { createAccessToken, refreshAccessToken } = await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'third-party');
		const db = getTestDB(dbUrl);
		await db.update(oauthTokens).set({ familyExpiresAt: new Date(Date.now() - 1000) });

		expect(await refreshAccessToken(refreshToken, 'third-party')).toBeUndefined();
		expect(
			(await db.select().from(oauthTokens)).filter((r) => !r.refreshTokenConsumedAt)
		).toHaveLength(0);
	});

	it('does not hand third-party tokens the account scope', async () => {
		const { createAccessToken, refreshAccessToken } = await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'third-party');
		await refreshAccessToken(refreshToken, 'third-party');

		const db = getTestDB(dbUrl);
		const [row] = (await db.select().from(oauthTokens)).filter((r) => !r.refreshTokenConsumedAt);
		expect(row.scopes).toEqual(['mcp:access']);
	});

	it('gives first-party tokens the account scope and keeps it through rotation', async () => {
		const { createAccessToken, refreshAccessToken, FIRST_PARTY_SCOPES } =
			await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'bissbilanz-mobile', undefined, {
			scopes: FIRST_PARTY_SCOPES
		});
		await refreshAccessToken(refreshToken, 'bissbilanz-mobile');

		const db = getTestDB(dbUrl);
		const [row] = (await db.select().from(oauthTokens)).filter((r) => !r.refreshTokenConsumedAt);
		expect(row.scopes).toEqual(['mcp:access', 'account:manage']);
	});
});

describe('refresh token reuse detection', () => {
	const ageConsumption = async (ms: number) => {
		const db = getTestDB(dbUrl);
		await db
			.update(oauthTokens)
			.set({ refreshTokenConsumedAt: new Date(Date.now() - ms) })
			.where(isNotNull(oauthTokens.refreshTokenConsumedAt));
	};

	it('keeps the rotated row so a replay can be recognised', async () => {
		const { createAccessToken, refreshAccessToken } = await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'third-party');
		await refreshAccessToken(refreshToken, 'third-party');

		const rows = await getTestDB(dbUrl).select().from(oauthTokens);
		expect(rows).toHaveLength(2);
		expect(rows.filter((r) => r.refreshTokenConsumedAt)).toHaveLength(1);
	});

	// Grace-window decision: a token replayed within REFRESH_REUSE_GRACE_MS of its rotation
	// is a lost response or a racing refresh from the legitimate client, so it gets a fresh
	// rotation of the same family instead of a sign-out. The family expiry is unchanged.
	it('answers a replay inside the grace window with a new rotation of the same family', async () => {
		const { createAccessToken, refreshAccessToken } = await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'third-party');
		const first = await refreshAccessToken(refreshToken, 'third-party');
		await ageConsumption(5_000);

		const replay = await refreshAccessToken(refreshToken, 'third-party');

		expect(replay).toBeTruthy();
		expect(replay!.refreshToken).not.toBe(first!.refreshToken);
		const rows = await getTestDB(dbUrl).select().from(oauthTokens);
		expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
		expect(await refreshAccessToken(replay!.refreshToken, 'third-party')).toBeTruthy();
	});

	it('does not sign anyone out when a racing refresh is retried with the old token', async () => {
		const { createAccessToken, refreshAccessToken } = await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'third-party');
		const results = await Promise.all(
			Array.from({ length: 5 }, () => refreshAccessToken(refreshToken, 'third-party'))
		);
		expect(results.every(Boolean)).toBe(true);
	});

	it('revokes the whole family when a token is replayed after the grace window', async () => {
		const { createAccessToken, refreshAccessToken, validateAccessToken } =
			await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'third-party');
		const first = await refreshAccessToken(refreshToken, 'third-party');
		const second = await refreshAccessToken(first!.refreshToken, 'third-party');
		await createAccessToken(userId, 'third-party');
		await ageConsumption(120_000);

		expect(await refreshAccessToken(refreshToken, 'third-party')).toBeUndefined();

		expect(await validateAccessToken(second!.accessToken)).toBeUndefined();
		expect(await refreshAccessToken(second!.refreshToken, 'third-party')).toBeUndefined();
		// A different grant of the same user is untouched.
		expect(await getTestDB(dbUrl).select().from(oauthTokens)).toHaveLength(1);
	});

	it('reports the reuse without the token value', async () => {
		const spy = vi.fn();
		vi.doMock('@sentry/sveltekit', () => ({ captureMessage: spy, captureException: vi.fn() }));
		vi.resetModules();
		const { createAccessToken, refreshAccessToken } = await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'third-party');
		await refreshAccessToken(refreshToken, 'third-party');
		await ageConsumption(120_000);
		await refreshAccessToken(refreshToken, 'third-party');

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][1]?.level).toBe('warning');
		expect(JSON.stringify(spy.mock.calls[0])).not.toContain(refreshToken);
		vi.doUnmock('@sentry/sveltekit');
		vi.resetModules();
	});

	it('rejects the old access token once its refresh token was rotated', async () => {
		const { createAccessToken, refreshAccessToken, validateAccessToken } =
			await import('$lib/server/oauth');
		const { accessToken, refreshToken } = await createAccessToken(userId, 'third-party');
		await refreshAccessToken(refreshToken, 'third-party');
		expect(await validateAccessToken(accessToken)).toBeUndefined();
	});

	it('prunes consumed rows after the retention period', async () => {
		const { createAccessToken, refreshAccessToken, cleanupExpiredOAuthData } =
			await import('$lib/server/oauth');
		const { refreshToken } = await createAccessToken(userId, 'third-party');
		await refreshAccessToken(refreshToken, 'third-party');
		await ageConsumption(8 * 24 * 60 * 60 * 1000);
		await cleanupExpiredOAuthData();
		expect(await getTestDB(dbUrl).select().from(oauthTokens)).toHaveLength(1);
	});

	it('upgrades a pre-family token and revokes it by its own id on reuse', async () => {
		const { refreshAccessToken } = await import('$lib/server/oauth');
		const { createHash } = await import('crypto');
		const db = getTestDB(dbUrl);
		const hash = (t: string) => createHash('sha256').update(t).digest('hex');
		await db.insert(oauthTokens).values({
			clientId: 'third-party',
			userId,
			accessTokenHash: hash('a'),
			refreshTokenHash: hash('r'),
			expiresAt: new Date(Date.now() + 1000),
			refreshTokenExpiresAt: new Date(Date.now() + 100_000)
		});
		expect(await refreshAccessToken('r', 'third-party')).toBeTruthy();
		await ageConsumption(120_000);
		expect(await refreshAccessToken('r', 'third-party')).toBeUndefined();
		expect(await db.select().from(oauthTokens)).toHaveLength(0);
	});
});

describe('session token hashing', () => {
	it('stores only a hash of the cookie value', async () => {
		const { createSession, getSessionWithUser, hashSessionToken } =
			await import('$lib/server/session');
		const created = await createSession(userId);

		const db = getTestDB(dbUrl);
		const [row] = await db.select().from(sessions).where(eq(sessions.userId, userId));
		expect(row.tokenHash).toBe(hashSessionToken(created.token));
		expect(row.id).not.toBe(created.token);
		expect((await getSessionWithUser(created.token))?.user.id).toBe(userId);
		expect(await getSessionWithUser(row.id)).toBeNull();
	});

	it('keeps pre-hash sessions signed in and moves them off the plaintext id', async () => {
		const { getSessionWithUser, hashSessionToken } = await import('$lib/server/session');
		const db = getTestDB(dbUrl);
		const [legacy] = await db
			.insert(sessions)
			.values({ userId, expiresAt: new Date(Date.now() + 60_000) })
			.returning();
		expect(legacy.tokenHash).toBeNull();

		const first = await getSessionWithUser(legacy.id);
		expect(first?.user.id).toBe(userId);

		const rows = await db.select().from(sessions);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).not.toBe(legacy.id);
		expect(rows[0].tokenHash).toBe(hashSessionToken(legacy.id));

		const second = await getSessionWithUser(legacy.id);
		expect(second?.session.id).toBe(rows[0].id);
	});

	it('survives concurrent first requests with the same legacy cookie', async () => {
		const { getSessionWithUser } = await import('$lib/server/session');
		const db = getTestDB(dbUrl);
		const [legacy] = await db
			.insert(sessions)
			.values({ userId, expiresAt: new Date(Date.now() + 60_000) })
			.returning();

		const results = await Promise.all(
			Array.from({ length: 6 }, () => getSessionWithUser(legacy.id))
		);

		expect(results.every((r) => r?.user.id === userId)).toBe(true);
		expect(await db.select().from(sessions)).toHaveLength(1);
	});

	it('logs out both hashed and legacy sessions', async () => {
		const { createSession, deleteSession } = await import('$lib/server/session');
		const db = getTestDB(dbUrl);
		const created = await createSession(userId);
		await deleteSession(created.token);
		expect(await db.select().from(sessions)).toHaveLength(0);

		const [legacy] = await db
			.insert(sessions)
			.values({ userId, expiresAt: new Date(Date.now() + 60_000) })
			.returning();
		await deleteSession(legacy.id);
		expect(await db.select().from(sessions)).toHaveLength(0);
	});
});

describe('migration 0069 backfill', () => {
	it('is idempotent for the mobile scope update', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(oauthTokens).values({
			clientId: 'bissbilanz-mobile',
			userId,
			accessTokenHash: 'a',
			refreshTokenHash: 'r',
			expiresAt: new Date(Date.now() + 1000)
		});
		const update = `UPDATE "oauth_tokens" SET "scopes" = array_append("scopes", 'account:manage') WHERE "client_id" = 'bissbilanz-mobile' AND NOT ('account:manage' = ANY("scopes"))`;
		const { sql } = await import('drizzle-orm');
		await db.execute(sql.raw(update));
		await db.execute(sql.raw(update));
		const [row] = await db.select().from(oauthTokens);
		expect(row.scopes).toEqual(['mcp:access', 'account:manage']);
	});
});
