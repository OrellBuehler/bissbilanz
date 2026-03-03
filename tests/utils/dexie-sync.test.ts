import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach } from 'vitest';
import { db, clearAllData, ensureUserScope } from '../../src/lib/db/index';

beforeEach(async () => {
	await Promise.all(db.tables.map((t) => t.clear()));
});

describe('Dexie sync queue', () => {
	test('can enqueue items', async () => {
		await db.syncQueue.add({
			method: 'POST',
			url: '/api/entries',
			body: JSON.stringify({ foodId: 'f1', date: '2026-02-28', servings: 1 }),
			createdAt: Date.now(),
			affectedTable: 'foodEntries'
		});

		const items = await db.syncQueue.toArray();
		expect(items).toHaveLength(1);
		expect(items[0].method).toBe('POST');
		expect(items[0].affectedTable).toBe('foodEntries');
		expect(items[0].id).toBeTruthy();
	});

	test('drains queue in order', async () => {
		await db.syncQueue.add({
			method: 'POST',
			url: '/api/entries',
			body: '{}',
			createdAt: 1000
		});
		await db.syncQueue.add({
			method: 'DELETE',
			url: '/api/entries/e1',
			body: '{}',
			createdAt: 2000
		});

		const items = await db.syncQueue.orderBy('createdAt').toArray();
		expect(items).toHaveLength(2);
		expect(items[0].method).toBe('POST');
		expect(items[1].method).toBe('DELETE');
	});

	test('removes individual items', async () => {
		const id = await db.syncQueue.add({
			method: 'POST',
			url: '/api/foods',
			body: '{}',
			createdAt: Date.now()
		});

		await db.syncQueue.delete(id);

		const items = await db.syncQueue.toArray();
		expect(items).toHaveLength(0);
	});

	test('clears all items', async () => {
		await db.syncQueue.bulkAdd([
			{ method: 'POST', url: '/api/foods', body: '{}', createdAt: 1 },
			{ method: 'POST', url: '/api/entries', body: '{}', createdAt: 2 },
			{ method: 'DELETE', url: '/api/foods/f1', body: '{}', createdAt: 3 }
		]);

		await db.syncQueue.clear();

		const items = await db.syncQueue.toArray();
		expect(items).toHaveLength(0);
	});
});

describe('clearAllData', () => {
	test('clears all tables', async () => {
		await db.foods.put({
			id: 'f1',
			userId: 'u1',
			name: 'Banana',
			brand: null,
			servingSize: 100,
			servingUnit: 'g',
			calories: 89,
			protein: 1.1,
			carbs: 23,
			fat: 0.3,
			fiber: 2.6,
			saturatedFat: null,
			monounsaturatedFat: null,
			polyunsaturatedFat: null,
			transFat: null,
			cholesterol: null,
			omega3: null,
			omega6: null,
			sugar: null,
			addedSugars: null,
			sugarAlcohols: null,
			starch: null,
			sodium: null,
			potassium: null,
			calcium: null,
			iron: null,
			magnesium: null,
			phosphorus: null,
			zinc: null,
			copper: null,
			manganese: null,
			selenium: null,
			iodine: null,
			fluoride: null,
			chromium: null,
			molybdenum: null,
			chloride: null,
			vitaminA: null,
			vitaminC: null,
			vitaminD: null,
			vitaminE: null,
			vitaminK: null,
			vitaminB1: null,
			vitaminB2: null,
			vitaminB3: null,
			vitaminB5: null,
			vitaminB6: null,
			vitaminB7: null,
			vitaminB9: null,
			vitaminB12: null,
			caffeine: null,
			alcohol: null,
			water: null,
			salt: null,
			barcode: null,
			isFavorite: false,
			nutriScore: null,
			novaGroup: null,
			additives: null,
			ingredientsText: null,
			imageUrl: null,
			createdAt: null,
			updatedAt: null
		});
		await db.userGoals.put({
			userId: 'u1',
			calorieGoal: 2000,
			proteinGoal: 150,
			carbGoal: 250,
			fatGoal: 67,
			fiberGoal: 30,
			sodiumGoal: null,
			sugarGoal: null,
			updatedAt: null
		});
		await db.syncQueue.add({
			method: 'POST',
			url: '/api/foods',
			body: '{}',
			createdAt: Date.now()
		});

		await clearAllData();

		expect(await db.foods.count()).toBe(0);
		expect(await db.userGoals.count()).toBe(0);
		expect(await db.syncQueue.count()).toBe(0);
	});
});

describe('sync metadata', () => {
	test('tracks last synced time per table', async () => {
		const now = Date.now();
		await db.syncMeta.put({ tableName: 'foods', lastSyncedAt: now });
		await db.syncMeta.put({ tableName: 'foodEntries', lastSyncedAt: now - 1000 });

		const foodsMeta = await db.syncMeta.get('foods');
		expect(foodsMeta?.lastSyncedAt).toBe(now);

		const entriesMeta = await db.syncMeta.get('foodEntries');
		expect(entriesMeta?.lastSyncedAt).toBe(now - 1000);
	});

	test('updates existing metadata', async () => {
		await db.syncMeta.put({ tableName: 'foods', lastSyncedAt: 1000 });
		await db.syncMeta.put({ tableName: 'foods', lastSyncedAt: 2000 });

		const meta = await db.syncMeta.get('foods');
		expect(meta?.lastSyncedAt).toBe(2000);
	});
});

describe('ensureUserScope', () => {
	const FOOD = {
		id: 'f1',
		userId: 'u1',
		name: 'Banana',
		brand: null,
		servingSize: 100,
		servingUnit: 'g',
		calories: 89,
		protein: 1.1,
		carbs: 23,
		fat: 0.3,
		fiber: 2.6,
		saturatedFat: null,
		monounsaturatedFat: null,
		polyunsaturatedFat: null,
		transFat: null,
		cholesterol: null,
		omega3: null,
		omega6: null,
		sugar: null,
		addedSugars: null,
		sugarAlcohols: null,
		starch: null,
		sodium: null,
		potassium: null,
		calcium: null,
		iron: null,
		magnesium: null,
		phosphorus: null,
		zinc: null,
		copper: null,
		manganese: null,
		selenium: null,
		iodine: null,
		fluoride: null,
		chromium: null,
		molybdenum: null,
		chloride: null,
		vitaminA: null,
		vitaminC: null,
		vitaminD: null,
		vitaminE: null,
		vitaminK: null,
		vitaminB1: null,
		vitaminB2: null,
		vitaminB3: null,
		vitaminB5: null,
		vitaminB6: null,
		vitaminB7: null,
		vitaminB9: null,
		vitaminB12: null,
		caffeine: null,
		alcohol: null,
		water: null,
		salt: null,
		barcode: null,
		isFavorite: false,
		nutriScore: null,
		novaGroup: null,
		additives: null,
		ingredientsText: null,
		imageUrl: null,
		createdAt: null,
		updatedAt: null
	};

	test('first-time login stores user sentinel', async () => {
		await ensureUserScope('user-abc');

		const sentinel = await db.syncMeta.get('__userId');
		expect(sentinel).toBeTruthy();
		expect(sentinel!.lastSyncedAt).toBeTypeOf('number');
	});

	test('same user login preserves data', async () => {
		await db.foods.put(FOOD);
		await ensureUserScope('user-abc');

		// Same user again
		await ensureUserScope('user-abc');

		const foods = await db.foods.toArray();
		expect(foods).toHaveLength(1);
		expect(foods[0].name).toBe('Banana');
	});

	test('different user login clears all data', async () => {
		await db.foods.put(FOOD);
		await db.userGoals.put({
			userId: 'u1',
			calorieGoal: 2000,
			proteinGoal: 150,
			carbGoal: 250,
			fatGoal: 67,
			fiberGoal: 30,
			sodiumGoal: null,
			sugarGoal: null,
			updatedAt: null
		});
		await ensureUserScope('user-abc');

		// Different user
		await ensureUserScope('user-xyz');

		expect(await db.foods.count()).toBe(0);
		expect(await db.userGoals.count()).toBe(0);

		// Sentinel should now belong to the new user
		const sentinel = await db.syncMeta.get('__userId');
		expect(sentinel).toBeTruthy();
	});

	test('clears sync queue on user switch', async () => {
		await db.syncQueue.add({
			method: 'POST',
			url: '/api/foods',
			body: '{}',
			createdAt: Date.now()
		});
		await ensureUserScope('user-abc');

		await ensureUserScope('user-xyz');

		expect(await db.syncQueue.count()).toBe(0);
	});
});
