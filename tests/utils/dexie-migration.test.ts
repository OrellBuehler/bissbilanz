import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import Dexie from 'dexie';

// Regression test for Sentry BISSBILANZ-1T:
//   "DatabaseClosedError: UpgradeError Not yet support for changing primary key".
// The v4 migration originally changed supplementLogs' primary key from `id` to the
// compound [supplementId+date] in place, which Dexie cannot do. Any user whose
// IndexedDB was created at schema v1–v3 crashed on upgrade. The fix drops the table
// in v4 and recreates it in v6. This seeds a legacy v1 database (the broken shape)
// and verifies the app's schema opens without throwing.

const DB_NAME = 'bissbilanz';

// The exact v1 schema as originally shipped — supplementLogs keyed by `id`.
async function seedLegacyV1Database() {
	const legacy = new Dexie(DB_NAME);
	legacy.version(1).stores({
		foods: 'id, name, barcode, isFavorite, updatedAt',
		foodEntries: 'id, date, mealType, foodId, recipeId, createdAt',
		recipes: 'id, name, isFavorite, updatedAt',
		recipeIngredients: 'id, recipeId, foodId',
		userGoals: 'userId',
		userPreferences: 'userId',
		customMealTypes: 'id, sortOrder',
		supplements: 'id, isActive, sortOrder',
		supplementLogs: 'id, supplementId, date, [supplementId+date]',
		weightEntries: 'id, entryDate, loggedAt',
		syncQueue: '++id, createdAt',
		syncMeta: 'tableName'
	});
	await legacy.open();
	// A row keyed by the old `id` primary key — the data shape that broke the upgrade.
	await legacy.table('supplementLogs').add({
		id: 'log-1',
		supplementId: 's1',
		date: '2026-01-01',
		count: 1
	});
	legacy.close();
}

describe('Dexie schema migration (BISSBILANZ-1T)', () => {
	test('upgrades a legacy v1 database (supplementLogs keyed by id) without error', async () => {
		await seedLegacyV1Database();

		// Import after seeding so the app db opens against the legacy IndexedDB.
		const { db } = await import('../../src/lib/db/index');
		await expect(db.open()).resolves.toBeDefined();
		expect(db.verno).toBe(7);

		// supplementLogs was dropped (v4) and recreated (v6): old rows are gone and
		// the table now accepts the compound primary key.
		expect(await db.table('supplementLogs').count()).toBe(0);
		await db.table('supplementLogs').add({ supplementId: 's1', date: '2026-01-01', count: 2 });
		const row = await db.table('supplementLogs').get(['s1', '2026-01-01']);
		expect(row?.count).toBe(2);

		db.close();
	});
});
