import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach } from 'bun:test';
import { db } from '../../src/lib/db/index';
import { getOfflineData } from '../../src/lib/db/offline-reads';

beforeEach(async () => {
	await Promise.all(db.tables.map((t) => t.clear()));
});

describe('getOfflineData', () => {
	test('returns foods list', async () => {
		await db.foods.bulkPut([
			{ id: 'f1', userId: 'u1', name: 'Banana', brand: null, servingSize: 100, servingUnit: 'g', calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sodium: null, sugar: null, saturatedFat: null, cholesterol: null, vitaminA: null, vitaminC: null, calcium: null, iron: null, barcode: null, isFavorite: false, nutriScore: null, novaGroup: null, additives: null, ingredientsText: null, imageUrl: null, createdAt: null, updatedAt: null },
			{ id: 'f2', userId: 'u1', name: 'Apple', brand: 'Organic', servingSize: 100, servingUnit: 'g', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sodium: null, sugar: null, saturatedFat: null, cholesterol: null, vitaminA: null, vitaminC: null, calcium: null, iron: null, barcode: null, isFavorite: true, nutriScore: null, novaGroup: null, additives: null, ingredientsText: null, imageUrl: null, createdAt: null, updatedAt: null }
		]);

		const data = (await getOfflineData('/api/foods')) as { foods: any[] };
		expect(data.foods).toHaveLength(2);
	});

	test('filters foods by search query', async () => {
		await db.foods.bulkPut([
			{ id: 'f1', userId: 'u1', name: 'Banana', brand: null, servingSize: 100, servingUnit: 'g', calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sodium: null, sugar: null, saturatedFat: null, cholesterol: null, vitaminA: null, vitaminC: null, calcium: null, iron: null, barcode: null, isFavorite: false, nutriScore: null, novaGroup: null, additives: null, ingredientsText: null, imageUrl: null, createdAt: null, updatedAt: null },
			{ id: 'f2', userId: 'u1', name: 'Apple', brand: null, servingSize: 100, servingUnit: 'g', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sodium: null, sugar: null, saturatedFat: null, cholesterol: null, vitaminA: null, vitaminC: null, calcium: null, iron: null, barcode: null, isFavorite: false, nutriScore: null, novaGroup: null, additives: null, ingredientsText: null, imageUrl: null, createdAt: null, updatedAt: null }
		]);

		const data = (await getOfflineData('/api/foods?q=ban')) as { foods: any[] };
		expect(data.foods).toHaveLength(1);
		expect(data.foods[0].name).toBe('Banana');
	});

	test('looks up food by barcode', async () => {
		await db.foods.put({ id: 'f1', userId: 'u1', name: 'Oats', brand: null, servingSize: 100, servingUnit: 'g', calories: 68, protein: 2.4, carbs: 12, fat: 1.4, fiber: 1.7, sodium: null, sugar: null, saturatedFat: null, cholesterol: null, vitaminA: null, vitaminC: null, calcium: null, iron: null, barcode: '123456', isFavorite: false, nutriScore: null, novaGroup: null, additives: null, ingredientsText: null, imageUrl: null, createdAt: null, updatedAt: null });

		const data = (await getOfflineData('/api/foods?barcode=123456')) as { food: any };
		expect(data.food.name).toBe('Oats');
	});

	test('returns entries by date', async () => {
		await db.foodEntries.bulkPut([
			{ id: 'e1', foodId: 'f1', recipeId: null, date: '2026-02-28', mealType: 'Breakfast', servings: 1, notes: null, foodName: 'Oats', calories: 68, protein: 2.4, carbs: 12, fat: 1.4, fiber: 1.7, servingSize: 100, servingUnit: 'g', createdAt: '2026-02-28T08:00:00Z' },
			{ id: 'e2', foodId: 'f2', recipeId: null, date: '2026-02-27', mealType: 'Lunch', servings: 2, notes: null, foodName: 'Rice', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, servingSize: 100, servingUnit: 'g', createdAt: '2026-02-27T12:00:00Z' }
		]);

		const data = (await getOfflineData('/api/entries?date=2026-02-28')) as { entries: any[] };
		expect(data.entries).toHaveLength(1);
		expect(data.entries[0].foodName).toBe('Oats');
	});

	test('returns goals', async () => {
		await db.userGoals.put({ userId: 'u1', calorieGoal: 2000, proteinGoal: 150, carbGoal: 250, fatGoal: 67, fiberGoal: 30, sodiumGoal: null, sugarGoal: null, updatedAt: null });

		const data = (await getOfflineData('/api/goals')) as { goals: any };
		expect(data.goals.calorieGoal).toBe(2000);
	});

	test('returns null goals when none set', async () => {
		const data = (await getOfflineData('/api/goals')) as { goals: any };
		expect(data.goals).toBeNull();
	});

	test('returns recipes list', async () => {
		await db.recipes.put({ id: 'r1', userId: 'u1', name: 'Caesar Salad', totalServings: 2, isFavorite: true, imageUrl: null, calories: 180, protein: 12, carbs: 8, fat: 10, createdAt: null, updatedAt: null });

		const data = (await getOfflineData('/api/recipes')) as { recipes: any[] };
		expect(data.recipes).toHaveLength(1);
	});

	test('returns weight entries', async () => {
		await db.weightEntries.put({ id: 'w1', userId: 'u1', weightKg: 75.5, entryDate: '2026-02-28', loggedAt: '2026-02-28T08:00:00Z', notes: null, createdAt: null, updatedAt: null });

		const data = (await getOfflineData('/api/weight')) as { entries: any[] };
		expect(data.entries).toHaveLength(1);
	});

	test('returns latest weight entry', async () => {
		await db.weightEntries.bulkPut([
			{ id: 'w1', userId: 'u1', weightKg: 75.5, entryDate: '2026-02-27', loggedAt: '2026-02-27T08:00:00Z', notes: null, createdAt: null, updatedAt: null },
			{ id: 'w2', userId: 'u1', weightKg: 75.0, entryDate: '2026-02-28', loggedAt: '2026-02-28T08:00:00Z', notes: null, createdAt: null, updatedAt: null }
		]);

		const data = (await getOfflineData('/api/weight/latest')) as { entry: any };
		expect(data.entry.weightKg).toBe(75.0);
	});

	test('returns null for unknown routes', async () => {
		const data = await getOfflineData('/api/unknown/route');
		expect(data).toBeNull();
	});

	test('returns favorites', async () => {
		await db.foods.put({ id: 'f1', userId: 'u1', name: 'Banana', brand: null, servingSize: 100, servingUnit: 'g', calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sodium: null, sugar: null, saturatedFat: null, cholesterol: null, vitaminA: null, vitaminC: null, calcium: null, iron: null, barcode: null, isFavorite: true, nutriScore: null, novaGroup: null, additives: null, ingredientsText: null, imageUrl: null, createdAt: null, updatedAt: null });

		const data = (await getOfflineData('/api/favorites')) as { foods: any[] };
		expect(data.foods).toHaveLength(1);
		expect(data.foods[0].type).toBe('food');
	});

	test('returns meal types', async () => {
		await db.customMealTypes.put({ id: 'mt1', userId: 'u1', name: 'Pre-Workout', sortOrder: 0, createdAt: null });

		const data = (await getOfflineData('/api/meal-types')) as { mealTypes: any[] };
		expect(data.mealTypes).toHaveLength(1);
	});

	test('returns preferences', async () => {
		await db.userPreferences.put({
			userId: 'u1', showChartWidget: true, showFavoritesWidget: true, showSupplementsWidget: false, showWeightWidget: true, showMealBreakdownWidget: true, showTopFoodsWidget: true, widgetOrder: ['chart'], startPage: 'favorites', favoriteTapAction: 'instant', favoriteMealAssignmentMode: 'time_based', updatedAt: null, locale: 'de', favoriteMealTimeframes: []
		});

		const data = (await getOfflineData('/api/preferences')) as { preferences: any };
		expect(data.preferences.startPage).toBe('favorites');
	});
});
