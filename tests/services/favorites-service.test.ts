import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import type { DexieFood, DexieRecipe } from '../../src/lib/db/types';

/**
 * Regression test: Dexie queries for isFavorite must use .filter()
 * instead of .where().equals() because booleans are not valid IndexedDB
 * index key types. Using .where('isFavorite').equals(1) or .equals(true)
 * produces unreliable results.
 */

type TestDB = Dexie & {
	foods: Dexie.Table<DexieFood, string>;
	recipes: Dexie.Table<DexieRecipe, string>;
};

function createTestDb(): TestDB {
	const db = new Dexie('test-favorites-' + Math.random()) as TestDB;
	db.version(1).stores({
		foods: 'id, name',
		recipes: 'id, name'
	});
	return db;
}

const makeFood = (overrides: Partial<DexieFood> = {}): DexieFood => ({
	id: 'food-1',
	userId: 'user-1',
	name: 'Test Food',
	brand: null,
	servingSize: 100,
	servingUnit: 'g',
	calories: 200,
	protein: 10,
	carbs: 20,
	fat: 5,
	fiber: 3,
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
	updatedAt: null,
	...overrides
});

const makeRecipe = (overrides: Partial<DexieRecipe> = {}): DexieRecipe => ({
	id: 'recipe-1',
	userId: 'user-1',
	name: 'Test Recipe',
	totalServings: 1,
	isFavorite: false,
	imageUrl: null,
	calories: null,
	protein: null,
	carbs: null,
	fat: null,
	fiber: null,
	createdAt: null,
	updatedAt: null,
	...overrides
});

describe('favorites Dexie queries use .filter() for boolean isFavorite', () => {
	let db: TestDB;

	beforeEach(() => {
		db = createTestDb();
	});

	afterEach(async () => {
		await db.delete();
	});

	test('filter finds favorite foods stored with boolean true', async () => {
		await db.foods.bulkAdd([
			makeFood({ id: 'f1', name: 'Fav Food', isFavorite: true }),
			makeFood({ id: 'f2', name: 'Normal Food', isFavorite: false })
		]);

		const results = await db.foods.filter((f) => f.isFavorite).toArray();
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe('Fav Food');
	});

	test('filter finds favorite recipes stored with boolean true', async () => {
		await db.recipes.bulkAdd([
			makeRecipe({ id: 'r1', name: 'Fav Recipe', isFavorite: true }),
			makeRecipe({ id: 'r2', name: 'Normal Recipe', isFavorite: false })
		]);

		const results = await db.recipes.filter((r) => r.isFavorite).toArray();
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe('Fav Recipe');
	});

	test('filter finds favorites after update from false to true', async () => {
		await db.foods.add(makeFood({ id: 'f1', isFavorite: false }));
		await db.foods.update('f1', { isFavorite: true });

		const results = await db.foods.filter((f) => f.isFavorite).toArray();
		expect(results).toHaveLength(1);
	});

	test('filter returns empty when all favorites are cleared', async () => {
		await db.foods.add(makeFood({ id: 'f1', isFavorite: true }));
		await db.foods.toCollection().modify({ isFavorite: false });

		const results = await db.foods.filter((f) => f.isFavorite).toArray();
		expect(results).toHaveLength(0);
	});
});
