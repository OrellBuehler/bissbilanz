import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/index';
import { applyOptimisticWrite } from '../../src/lib/db/optimistic';

beforeEach(async () => {
	await Promise.all(db.tables.map((t) => t.clear()));
});

describe('applyOptimisticWrite - CREATE', () => {
	test('creates a food entry optimistically', async () => {
		await applyOptimisticWrite('POST', '/api/foods', {
			name: 'Banana',
			servingSize: 100,
			servingUnit: 'g',
			calories: 89,
			protein: 1.1,
			carbs: 23,
			fat: 0.3,
			fiber: 2.6
		});

		const foods = await db.foods.toArray();
		expect(foods).toHaveLength(1);
		expect(foods[0].name).toBe('Banana');
		expect(foods[0].calories).toBe(89);
		expect(foods[0].id).toBeTruthy();
	});

	test('creates a food entry with denormalized data', async () => {
		// Pre-populate a food
		await db.foods.put({
			id: 'f1',
			userId: 'u1',
			name: 'Chicken',
			brand: null,
			servingSize: 100,
			servingUnit: 'g',
			calories: 165,
			protein: 31,
			carbs: 0,
			fat: 3.6,
			fiber: 0,
			sodium: null,
			sugar: null,
			saturatedFat: null,
			cholesterol: null,
			vitaminA: null,
			vitaminC: null,
			calcium: null,
			iron: null,
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

		await applyOptimisticWrite('POST', '/api/entries', {
			foodId: 'f1',
			date: '2026-02-28',
			mealType: 'Lunch',
			servings: 2
		});

		const entries = await db.foodEntries.toArray();
		expect(entries).toHaveLength(1);
		expect(entries[0].foodName).toBe('Chicken');
		expect(entries[0].calories).toBe(330); // 165 * 2 servings
		expect(entries[0].protein).toBe(62); // 31 * 2 servings
	});

	test('creates a weight entry', async () => {
		await applyOptimisticWrite('POST', '/api/weight', {
			weightKg: 75.5,
			entryDate: '2026-02-28'
		});

		const entries = await db.weightEntries.toArray();
		expect(entries).toHaveLength(1);
		expect(entries[0].weightKg).toBe(75.5);
	});

	test('creates goals (upsert)', async () => {
		await applyOptimisticWrite('POST', '/api/goals', {
			calorieGoal: 2000,
			proteinGoal: 150,
			carbGoal: 250,
			fatGoal: 67,
			fiberGoal: 30
		});

		const goals = await db.userGoals.toArray();
		expect(goals).toHaveLength(1);
		expect(goals[0].calorieGoal).toBe(2000);
	});

	test('creates a recipe with ingredients', async () => {
		await applyOptimisticWrite('POST', '/api/recipes', {
			name: 'Caesar Salad',
			totalServings: 2,
			ingredients: [
				{ foodId: 'f1', quantity: 100, servingUnit: 'g', sortOrder: 0 },
				{ foodId: 'f2', quantity: 50, servingUnit: 'g', sortOrder: 1 }
			]
		});

		const recipes = await db.recipes.toArray();
		expect(recipes).toHaveLength(1);
		expect(recipes[0].name).toBe('Caesar Salad');

		const ingredients = await db.recipeIngredients.toArray();
		expect(ingredients).toHaveLength(2);
	});

	test('creates a custom meal type', async () => {
		await applyOptimisticWrite('POST', '/api/meal-types', {
			name: 'Pre-Workout',
			sortOrder: 0
		});

		const types = await db.customMealTypes.toArray();
		expect(types).toHaveLength(1);
		expect(types[0].name).toBe('Pre-Workout');
	});
});

describe('applyOptimisticWrite - UPDATE', () => {
	test('updates a food', async () => {
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
			sodium: null,
			sugar: null,
			saturatedFat: null,
			cholesterol: null,
			vitaminA: null,
			vitaminC: null,
			calcium: null,
			iron: null,
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

		await applyOptimisticWrite('PATCH', '/api/foods/f1', {
			name: 'Green Banana',
			calories: 85
		});

		const food = await db.foods.get('f1');
		expect(food?.name).toBe('Green Banana');
		expect(food?.calories).toBe(85);
		expect(food?.updatedAt).toBeTruthy();
	});

	test('updates an entry', async () => {
		await db.foodEntries.put({
			id: 'e1',
			foodId: 'f1',
			recipeId: null,
			date: '2026-02-28',
			mealType: 'Breakfast',
			servings: 1,
			notes: null,
			foodName: 'Oats',
			calories: 68,
			protein: 2.4,
			carbs: 12,
			fat: 1.4,
			fiber: 1.7,
			servingSize: 100,
			servingUnit: 'g',
			createdAt: '2026-02-28T08:00:00Z'
		});

		await applyOptimisticWrite('PATCH', '/api/entries/e1', {
			servings: 2,
			mealType: 'Snacks'
		});

		const entry = await db.foodEntries.get('e1');
		expect(entry?.servings).toBe(2);
		expect(entry?.mealType).toBe('Snacks');
	});
});

describe('applyOptimisticWrite - DELETE', () => {
	test('deletes a food', async () => {
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
			sodium: null,
			sugar: null,
			saturatedFat: null,
			cholesterol: null,
			vitaminA: null,
			vitaminC: null,
			calcium: null,
			iron: null,
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

		await applyOptimisticWrite('DELETE', '/api/foods/f1', {});

		const food = await db.foods.get('f1');
		expect(food).toBeUndefined();
	});

	test('deletes an entry', async () => {
		await db.foodEntries.put({
			id: 'e1',
			foodId: 'f1',
			recipeId: null,
			date: '2026-02-28',
			mealType: 'Breakfast',
			servings: 1,
			notes: null,
			foodName: 'Oats',
			calories: 68,
			protein: 2.4,
			carbs: 12,
			fat: 1.4,
			fiber: 1.7,
			servingSize: 100,
			servingUnit: 'g',
			createdAt: '2026-02-28T08:00:00Z'
		});

		await applyOptimisticWrite('DELETE', '/api/entries/e1', {});

		const entry = await db.foodEntries.get('e1');
		expect(entry).toBeUndefined();
	});

	test('deletes a recipe and its ingredients', async () => {
		await db.recipes.put({
			id: 'r1',
			userId: 'u1',
			name: 'Salad',
			totalServings: 1,
			isFavorite: false,
			imageUrl: null,
			calories: null,
			protein: null,
			carbs: null,
			fat: null,
			createdAt: null,
			updatedAt: null
		});
		await db.recipeIngredients.bulkPut([
			{ id: 'ri1', recipeId: 'r1', foodId: 'f1', quantity: 100, servingUnit: 'g', sortOrder: 0 },
			{ id: 'ri2', recipeId: 'r1', foodId: 'f2', quantity: 50, servingUnit: 'g', sortOrder: 1 }
		]);

		await applyOptimisticWrite('DELETE', '/api/recipes/r1', {});

		expect(await db.recipes.get('r1')).toBeUndefined();
		expect(await db.recipeIngredients.where('recipeId').equals('r1').count()).toBe(0);
	});

	test('deletes a weight entry', async () => {
		await db.weightEntries.put({
			id: 'w1',
			userId: 'u1',
			weightKg: 75.5,
			entryDate: '2026-02-28',
			loggedAt: '2026-02-28T08:00:00Z',
			notes: null,
			createdAt: null,
			updatedAt: null
		});

		await applyOptimisticWrite('DELETE', '/api/weight/w1', {});

		expect(await db.weightEntries.get('w1')).toBeUndefined();
	});

	test('does nothing for unknown resource delete', async () => {
		// Should not throw
		await applyOptimisticWrite('DELETE', '/api/unknown/123', {});
	});
});

describe('applyOptimisticWrite - edge cases', () => {
	test('ignores non-API URLs', async () => {
		await applyOptimisticWrite('POST', '/other/path', { data: 'test' });
		// Should not throw
	});

	test('handles missing entity ID gracefully', async () => {
		await applyOptimisticWrite('PATCH', '/api/foods', { name: 'Test' });
		// Should not throw (no entity ID to update)
	});
});
