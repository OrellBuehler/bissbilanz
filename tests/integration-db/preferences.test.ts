import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users } from '$lib/server/schema';

const DB_NAME = 'test_preferences';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

let userId: string;

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(users);

	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `preferences-test-${Date.now()}` })
		.returning();
	userId = user.id;
});

describe('preferences aiTaskProcessor / aiTaskAutoLog (integration)', () => {
	it('defaults to assistant / auto-log off once the row exists', async () => {
		const { updatePreferences, getPreferences } = await import('$lib/server/preferences');

		// Any update creates the preferences row with column defaults applied.
		const created = await updatePreferences(userId, { showChartWidget: true });
		expect(created.success).toBe(true);

		const prefs = await getPreferences(userId);
		expect(prefs?.aiTaskProcessor).toBe('assistant');
		expect(prefs?.aiTaskAutoLog).toBe(false);
	});

	it('round-trips an update to device + auto-log on', async () => {
		const { updatePreferences, getPreferences } = await import('$lib/server/preferences');

		const result = await updatePreferences(userId, {
			aiTaskProcessor: 'device',
			aiTaskAutoLog: true
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data?.aiTaskProcessor).toBe('device');
			expect(result.data?.aiTaskAutoLog).toBe(true);
		}

		const prefs = await getPreferences(userId);
		expect(prefs?.aiTaskProcessor).toBe('device');
		expect(prefs?.aiTaskAutoLog).toBe(true);
	});

	it('rejects an invalid aiTaskProcessor before it reaches the database', async () => {
		const { updatePreferences } = await import('$lib/server/preferences');
		const result = await updatePreferences(userId, { aiTaskProcessor: 'gemini' });
		expect(result.success).toBe(false);
	});
});
