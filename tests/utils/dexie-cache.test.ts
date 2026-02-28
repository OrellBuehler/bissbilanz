import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach } from 'bun:test';
import { db } from '../../src/lib/db/index';
import { cacheApiResponse } from '../../src/lib/db/cache';

beforeEach(async () => {
	await Promise.all(db.tables.map((t) => t.clear()));
});

describe('cacheApiResponse', () => {
	test('caches foods list', async () => {
		const foods = [
			{ id: 'f1', name: 'Banana', calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, servingSize: 100, servingUnit: 'g', isFavorite: false },
			{ id: 'f2', name: 'Apple', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, servingSize: 100, servingUnit: 'g', isFavorite: true }
		];
		await cacheApiResponse('/api/foods', { foods });

		const cached = await db.foods.toArray();
		expect(cached).toHaveLength(2);
		expect(cached[0].name).toBe('Banana');
		expect(cached[1].name).toBe('Apple');
	});

	test('caches single food by barcode', async () => {
		const food = { id: 'f1', name: 'Oats', barcode: '123456', calories: 68, protein: 2.4, carbs: 12, fat: 1.4, fiber: 1.7, servingSize: 100, servingUnit: 'g', isFavorite: false };
		await cacheApiResponse('/api/foods?barcode=123456', { food });

		const cached = await db.foods.get('f1');
		expect(cached?.barcode).toBe('123456');
	});

	test('caches entries by date and replaces old ones', async () => {
		// Pre-populate with stale entries
		await db.foodEntries.put({ id: 'old1', date: '2026-02-28', mealType: 'Breakfast', servings: 1, foodId: null, recipeId: null, notes: null, foodName: null, calories: null, protein: null, carbs: null, fat: null, fiber: null, servingSize: null, servingUnit: null, createdAt: null });

		const entries = [
			{ id: 'e1', date: '2026-02-28', mealType: 'Lunch', servings: 2, foodId: 'f1', recipeId: null, foodName: 'Chicken', calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, servingSize: 100, servingUnit: 'g', createdAt: '2026-02-28T12:00:00Z' }
		];
		await cacheApiResponse('/api/entries?date=2026-02-28', { entries });

		const cached = await db.foodEntries.where('date').equals('2026-02-28').toArray();
		expect(cached).toHaveLength(1);
		expect(cached[0].id).toBe('e1');
		expect(cached[0].foodName).toBe('Chicken');
	});

	test('caches recipes list', async () => {
		const recipes = [
			{ id: 'r1', name: 'Caesar Salad', totalServings: 2, isFavorite: true, calories: 180, protein: 12, carbs: 8, fat: 10, imageUrl: null }
		];
		await cacheApiResponse('/api/recipes', { recipes });

		const cached = await db.recipes.toArray();
		expect(cached).toHaveLength(1);
		expect(cached[0].name).toBe('Caesar Salad');
	});

	test('caches goals', async () => {
		const goals = { userId: 'u1', calorieGoal: 2000, proteinGoal: 150, carbGoal: 250, fatGoal: 67, fiberGoal: 30, sodiumGoal: null, sugarGoal: null, updatedAt: '2026-02-28' };
		await cacheApiResponse('/api/goals', { goals });

		const cached = await db.userGoals.toArray();
		expect(cached).toHaveLength(1);
		expect(cached[0].calorieGoal).toBe(2000);
	});

	test('caches preferences', async () => {
		const preferences = {
			userId: 'u1',
			showChartWidget: true,
			showFavoritesWidget: true,
			showSupplementsWidget: false,
			showWeightWidget: true,
			showMealBreakdownWidget: true,
			showTopFoodsWidget: true,
			widgetOrder: ['chart', 'favorites'],
			startPage: 'dashboard',
			favoriteTapAction: 'instant',
			favoriteMealAssignmentMode: 'time_based',
			updatedAt: '2026-02-28',
			locale: 'en',
			favoriteMealTimeframes: []
		};
		await cacheApiResponse('/api/preferences', { preferences });

		const cached = await db.userPreferences.toArray();
		expect(cached).toHaveLength(1);
		expect(cached[0].startPage).toBe('dashboard');
	});

	test('caches meal types', async () => {
		const mealTypes = [
			{ id: 'mt1', userId: 'u1', name: 'Pre-Workout', sortOrder: 0, createdAt: '2026-02-28' }
		];
		await cacheApiResponse('/api/meal-types', { mealTypes });

		const cached = await db.customMealTypes.toArray();
		expect(cached).toHaveLength(1);
		expect(cached[0].name).toBe('Pre-Workout');
	});

	test('caches weight entries', async () => {
		const entries = [
			{ id: 'w1', userId: 'u1', weightKg: 75.5, entryDate: '2026-02-28', loggedAt: '2026-02-28T08:00:00Z', notes: null, createdAt: '2026-02-28', updatedAt: '2026-02-28' }
		];
		await cacheApiResponse('/api/weight', { entries });

		const cached = await db.weightEntries.toArray();
		expect(cached).toHaveLength(1);
		expect(cached[0].weightKg).toBe(75.5);
	});

	test('caches latest weight entry', async () => {
		const entry = { id: 'w1', userId: 'u1', weightKg: 74.0, entryDate: '2026-02-27', loggedAt: '2026-02-27T08:00:00Z', notes: null, createdAt: '2026-02-27', updatedAt: '2026-02-27' };
		await cacheApiResponse('/api/weight/latest', { entry });

		const cached = await db.weightEntries.get('w1');
		expect(cached?.weightKg).toBe(74.0);
	});

	test('updates sync metadata', async () => {
		await cacheApiResponse('/api/foods', { foods: [{ id: 'f1', name: 'Test' }] });

		const meta = await db.syncMeta.get('foods');
		expect(meta).toBeTruthy();
		expect(meta!.lastSyncedAt).toBeGreaterThan(0);
	});

	test('ignores unknown routes', async () => {
		await cacheApiResponse('/api/unknown/route', { data: 'test' });
		// Should not throw
	});

	test('ignores null data', async () => {
		await cacheApiResponse('/api/foods', null as any);
		const cached = await db.foods.toArray();
		expect(cached).toHaveLength(0);
	});
});
