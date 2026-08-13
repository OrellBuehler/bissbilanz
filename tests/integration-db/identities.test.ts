import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, identities } from '$lib/server/schema';

const DB_NAME = 'test_identities';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	// auth-account reaches for the table objects through db.ts, which re-exports
	// the whole schema, so the mock has to carry them too.
	vi.doMock('$lib/server/db', async () => {
		const schema = await vi.importActual<typeof import('$lib/server/schema')>('$lib/server/schema');
		return { getDB: () => db, ...schema };
	});
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(identities);
	await db.delete(users);
});

const account = async () => import('$lib/server/auth-account');

describe('findOrCreateUserByIdentity', () => {
	it('creates a user and its identity on first sign-in', async () => {
		const { findOrCreateUserByIdentity } = await account();
		const db = getTestDB(dbUrl);

		const user = await findOrCreateUserByIdentity(
			'google',
			{ sub: 'g-1', email: 'ada@gmail.com', name: 'Ada' },
			'de'
		);

		expect(user.email).toBe('ada@gmail.com');
		expect(user.locale).toBe('de');
		// Non-Infomaniak signups must not populate the legacy column.
		expect(user.infomaniakSub).toBeNull();

		const rows = await db.select().from(identities).where(eq(identities.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ provider: 'google', subject: 'g-1' });
	});

	it('returns the same user on a second sign-in instead of creating another', async () => {
		const { findOrCreateUserByIdentity } = await account();
		const db = getTestDB(dbUrl);

		const first = await findOrCreateUserByIdentity('google', { sub: 'g-1' }, 'en');
		const second = await findOrCreateUserByIdentity('google', { sub: 'g-1' }, 'en');

		expect(second.id).toBe(first.id);
		expect(await db.select().from(users)).toHaveLength(1);
	});

	it('keeps the same subject on different providers apart', async () => {
		const { findOrCreateUserByIdentity } = await account();

		const google = await findOrCreateUserByIdentity('google', { sub: 'shared-sub' }, 'en');
		const microsoft = await findOrCreateUserByIdentity('microsoft', { sub: 'shared-sub' }, 'en');

		expect(microsoft.id).not.toBe(google.id);
	});

	it('does not merge accounts that happen to share an email address', async () => {
		const { findOrCreateUserByIdentity } = await account();

		const google = await findOrCreateUserByIdentity(
			'google',
			{ sub: 'g-1', email: 'a@b.ch' },
			'en'
		);
		const microsoft = await findOrCreateUserByIdentity(
			'microsoft',
			{ sub: 'm-1', email: 'a@b.ch' },
			'en'
		);

		expect(microsoft.id).not.toBe(google.id);
	});

	it('adopts a pre-identities Infomaniak account instead of duplicating it', async () => {
		const { findOrCreateUserByIdentity } = await account();
		const db = getTestDB(dbUrl);

		const [legacy] = await db
			.insert(users)
			.values({ infomaniakSub: 'legacy-sub', email: 'old@example.ch' })
			.returning();

		const user = await findOrCreateUserByIdentity('infomaniak', { sub: 'legacy-sub' }, 'en');

		expect(user.id).toBe(legacy.id);
		expect(await db.select().from(users)).toHaveLength(1);
		const rows = await db.select().from(identities).where(eq(identities.userId, legacy.id));
		expect(rows).toHaveLength(1);
	});

	it('leaves fields the provider did not return untouched', async () => {
		const { findOrCreateUserByIdentity, linkIdentity } = await account();

		const user = await findOrCreateUserByIdentity(
			'google',
			{ sub: 'g-1', email: 'ada@gmail.com', name: 'Ada', avatarUrl: 'https://img/a.png' },
			'en'
		);
		await linkIdentity(user.id, 'microsoft', { sub: 'm-1', email: 'ada@outlook.com' });

		// Microsoft sends no picture; signing in with it must not clear the stored one.
		const afterMicrosoft = await findOrCreateUserByIdentity(
			'microsoft',
			{ sub: 'm-1', email: 'ada@outlook.com' },
			'en'
		);

		expect(afterMicrosoft.avatarUrl).toBe('https://img/a.png');
		expect(afterMicrosoft.name).toBe('Ada');
		expect(afterMicrosoft.email).toBe('ada@outlook.com');
	});
});

describe('linkIdentity', () => {
	it('lets a second provider sign in to the same account', async () => {
		const { findOrCreateUserByIdentity, linkIdentity } = await account();

		const user = await findOrCreateUserByIdentity('infomaniak', { sub: 'i-1' }, 'en');
		await linkIdentity(user.id, 'google', { sub: 'g-1' });

		const viaGoogle = await findOrCreateUserByIdentity('google', { sub: 'g-1' }, 'en');
		expect(viaGoogle.id).toBe(user.id);
	});

	it('refuses an identity that already belongs to someone else', async () => {
		const { findOrCreateUserByIdentity, linkIdentity, IdentityConflictError } = await account();

		const owner = await findOrCreateUserByIdentity('google', { sub: 'g-1' }, 'en');
		const other = await findOrCreateUserByIdentity('infomaniak', { sub: 'i-1' }, 'en');
		expect(other.id).not.toBe(owner.id);

		await expect(linkIdentity(other.id, 'google', { sub: 'g-1' })).rejects.toBeInstanceOf(
			IdentityConflictError
		);
	});

	it('is a no-op when the identity is already linked to the same user', async () => {
		const { findOrCreateUserByIdentity, linkIdentity, listIdentities } = await account();

		const user = await findOrCreateUserByIdentity('google', { sub: 'g-1' }, 'en');
		await linkIdentity(user.id, 'google', { sub: 'g-1' });

		expect(await listIdentities(user.id)).toHaveLength(1);
	});
});

describe('unlinkIdentity', () => {
	it('removes a provider once another one remains', async () => {
		const { findOrCreateUserByIdentity, linkIdentity, listIdentities, unlinkIdentity } =
			await account();

		const user = await findOrCreateUserByIdentity('infomaniak', { sub: 'i-1' }, 'en');
		await linkIdentity(user.id, 'google', { sub: 'g-1' });

		const before = await listIdentities(user.id);
		const google = before.find((i) => i.provider === 'google')!;
		await unlinkIdentity(user.id, google.id);

		const after = await listIdentities(user.id);
		expect(after.map((i) => i.provider)).toEqual(['infomaniak']);
	});

	it('refuses to remove the only way left to sign in', async () => {
		const { findOrCreateUserByIdentity, listIdentities, unlinkIdentity, LastIdentityError } =
			await account();

		const user = await findOrCreateUserByIdentity('google', { sub: 'g-1' }, 'en');
		const [only] = await listIdentities(user.id);

		await expect(unlinkIdentity(user.id, only.id)).rejects.toBeInstanceOf(LastIdentityError);
		expect(await listIdentities(user.id)).toHaveLength(1);
	});

	it('ignores an identity belonging to another user', async () => {
		const { findOrCreateUserByIdentity, listIdentities, unlinkIdentity } = await account();

		const victim = await findOrCreateUserByIdentity('google', { sub: 'g-1' }, 'en');
		const attacker = await findOrCreateUserByIdentity('infomaniak', { sub: 'i-1' }, 'en');
		const [victimIdentity] = await listIdentities(victim.id);

		await unlinkIdentity(attacker.id, victimIdentity.id);

		expect(await listIdentities(victim.id)).toHaveLength(1);
	});

	it('clears the legacy column so a removed Infomaniak link cannot come back', async () => {
		const { findOrCreateUserByIdentity, linkIdentity, listIdentities, unlinkIdentity } =
			await account();
		const db = getTestDB(dbUrl);

		const user = await findOrCreateUserByIdentity('infomaniak', { sub: 'i-1' }, 'en');
		await linkIdentity(user.id, 'google', { sub: 'g-1' });

		const infomaniak = (await listIdentities(user.id)).find((i) => i.provider === 'infomaniak')!;
		await unlinkIdentity(user.id, infomaniak.id);

		const [row] = await db.select().from(users).where(eq(users.id, user.id));
		expect(row.infomaniakSub).toBeNull();

		// A fresh Infomaniak sign-in now creates a separate account rather than adopting this one.
		const rejoined = await findOrCreateUserByIdentity('infomaniak', { sub: 'i-1' }, 'en');
		expect(rejoined.id).not.toBe(user.id);
	});
});
