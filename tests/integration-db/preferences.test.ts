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

describe('preferences assistant options (integration)', () => {
	it('turns every option on once the row exists, and for a user without a row', async () => {
		const { updatePreferences, getPreferences } = await import('$lib/server/preferences');
		const { loadAssistantOptions } = await import('$lib/server/claude/assistant-options');
		const on = {
			researchNutrients: true,
			webResearch: true,
			realServings: true,
			createFoods: true
		};
		expect(await loadAssistantOptions(userId)).toEqual(on);

		await updatePreferences(userId, { showChartWidget: true });
		const prefs = await getPreferences(userId);
		expect(prefs).toMatchObject({
			aiResearchNutrients: true,
			aiWebResearch: true,
			aiRealServings: true,
			aiTaskCreateFoods: true
		});
		expect(await loadAssistantOptions(userId)).toEqual(on);
	});

	it('stores each option on its own and leaves the others alone', async () => {
		const { updatePreferences, getPreferences } = await import('$lib/server/preferences');
		const { loadAssistantOptions } = await import('$lib/server/claude/assistant-options');

		const result = await updatePreferences(userId, { aiWebResearch: false });
		expect(result.success).toBe(true);
		expect(await loadAssistantOptions(userId)).toEqual({
			researchNutrients: true,
			webResearch: false,
			realServings: true,
			createFoods: true
		});

		await updatePreferences(userId, { aiResearchNutrients: false, aiTaskCreateFoods: false });
		expect(await loadAssistantOptions(userId)).toEqual({
			researchNutrients: false,
			webResearch: false,
			realServings: true,
			createFoods: false
		});
		expect((await getPreferences(userId))?.aiRealServings).toBe(true);
	});
});
