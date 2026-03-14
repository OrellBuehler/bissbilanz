import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, lt } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, sessions, oauthClients } from '$lib/server/schema';

const DB_NAME = 'test_server_startup';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('server startup sequence', () => {
	it('ensureMobileClient creates the mobile OAuth client', async () => {
		const db = getTestDB(dbUrl);
		const MOBILE_CLIENT_ID = 'bissbilanz-mobile';

		const existing = await db.query.oauthClients.findFirst({
			where: eq(oauthClients.clientId, MOBILE_CLIENT_ID)
		});
		if (!existing) {
			await db.insert(oauthClients).values({
				clientId: MOBILE_CLIENT_ID,
				clientName: 'Bissbilanz Mobile',
				tokenEndpointAuthMethod: 'none',
				allowedRedirectUris: []
			});
		}

		const client = await db.query.oauthClients.findFirst({
			where: eq(oauthClients.clientId, MOBILE_CLIENT_ID)
		});
		expect(client).toBeDefined();
		expect(client!.clientName).toBe('Bissbilanz Mobile');
	});

	it('ensureMobileClient is idempotent', async () => {
		const db = getTestDB(dbUrl);
		const MOBILE_CLIENT_ID = 'bissbilanz-mobile';

		const existing = await db.query.oauthClients.findFirst({
			where: eq(oauthClients.clientId, MOBILE_CLIENT_ID)
		});
		expect(existing).toBeDefined();

		const all = await db
			.select()
			.from(oauthClients)
			.where(eq(oauthClients.clientId, MOBILE_CLIENT_ID));
		expect(all).toHaveLength(1);
	});

	it('cleanExpiredSessions removes expired sessions', async () => {
		const db = getTestDB(dbUrl);

		const [user] = await db
			.insert(users)
			.values({
				infomaniakSub: 'test-startup-user',
				email: 'test@example.com',
				name: 'Test User'
			})
			.returning();

		const pastDate = new Date(Date.now() - 86400000);
		await db.insert(sessions).values({
			userId: user.id,
			expiresAt: pastDate
		});

		const futureDate = new Date(Date.now() + 86400000);
		await db.insert(sessions).values({
			userId: user.id,
			expiresAt: futureDate
		});

		await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

		const remaining = await db.select().from(sessions).where(eq(sessions.userId, user.id));
		expect(remaining).toHaveLength(1);
		expect(remaining[0].expiresAt > new Date()).toBe(true);
	});
});
