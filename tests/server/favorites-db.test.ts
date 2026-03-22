import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_FOOD, TEST_FOOD_2, TEST_RECIPE } from '../helpers/fixtures';

const { db, setResult, reset } = createMockDB();

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { listFavoriteFoods, listFavoriteRecipes } = await import('$lib/server/favorites');

describe('favorites-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('listFavoriteFoods', () => {
		test('returns favorite foods with log counts', async () => {
			const favFood = { ...TEST_FOOD, isFavorite: true, logCount: 5 };
			setResult([favFood]);

			const result = await listFavoriteFoods(TEST_USER.id);
			expect(result).toHaveLength(1);
			expect(result[0].logCount).toBe(5);
			expect(result[0].type).toBe('food');
		});

		test('returns multiple favorite foods ordered by log count', async () => {
			const favFood1 = { ...TEST_FOOD, isFavorite: true, logCount: 10 };
			const favFood2 = { ...TEST_FOOD_2, isFavorite: true, logCount: 3 };
			setResult([favFood1, favFood2]);

			const result = await listFavoriteFoods(TEST_USER.id);
			expect(result).toHaveLength(2);
			expect(result[0].logCount).toBe(10);
			expect(result[1].logCount).toBe(3);
		});

		test('returns empty array when no favorites', async () => {
			setResult([]);

			const result = await listFavoriteFoods(TEST_USER.id);
			expect(result).toEqual([]);
		});

		test('respects custom limit parameter', async () => {
			const favFood = { ...TEST_FOOD, isFavorite: true, logCount: 1 };
			setResult([favFood]);

			const result = await listFavoriteFoods(TEST_USER.id, 10);
			expect(result).toHaveLength(1);
		});

		test('adds type field to each result', async () => {
			const favFood = { ...TEST_FOOD, isFavorite: true, logCount: 2 };
			setResult([favFood]);

			const result = await listFavoriteFoods(TEST_USER.id);
			expect(result[0].type).toBe('food');
		});

		test('converts logCount to number', async () => {
			const favFood = { ...TEST_FOOD, isFavorite: true, logCount: '7' };
			setResult([favFood]);

			const result = await listFavoriteFoods(TEST_USER.id);
			expect(typeof result[0].logCount).toBe('number');
			expect(result[0].logCount).toBe(7);
		});
	});

	describe('listFavoriteRecipes', () => {
		test('returns favorite recipes with aggregated macros', async () => {
			const favRecipe = {
				...TEST_RECIPE,
				isFavorite: true,
				logCount: 4,
				calories: 450,
				protein: 20,
				carbs: 55,
				fat: 12,
				fiber: 8
			};
			setResult([favRecipe]);

			const result = await listFavoriteRecipes(TEST_USER.id);
			expect(result).toHaveLength(1);
			expect(result[0].calories).toBe(450);
			expect(result[0].protein).toBe(20);
			expect(result[0].carbs).toBe(55);
			expect(result[0].fat).toBe(12);
			expect(result[0].fiber).toBe(8);
		});

		test('returns empty array when no favorite recipes', async () => {
			setResult([]);

			const result = await listFavoriteRecipes(TEST_USER.id);
			expect(result).toEqual([]);
		});

		test('respects custom limit parameter', async () => {
			const favRecipe = {
				...TEST_RECIPE,
				isFavorite: true,
				logCount: 1,
				calories: 300,
				protein: 15,
				carbs: 40,
				fat: 8,
				fiber: 5
			};
			setResult([favRecipe]);

			const result = await listFavoriteRecipes(TEST_USER.id, 5);
			expect(result).toHaveLength(1);
		});

		test('adds type field to each result', async () => {
			const favRecipe = {
				...TEST_RECIPE,
				isFavorite: true,
				logCount: 2,
				calories: 300,
				protein: 15,
				carbs: 40,
				fat: 8,
				fiber: 5
			};
			setResult([favRecipe]);

			const result = await listFavoriteRecipes(TEST_USER.id);
			expect(result[0].type).toBe('recipe');
		});

		test('converts numeric fields from db types', async () => {
			const favRecipe = {
				...TEST_RECIPE,
				isFavorite: true,
				logCount: '3',
				calories: '450.5',
				protein: '20.2',
				carbs: '55.1',
				fat: '12.3',
				fiber: '8.4'
			};
			setResult([favRecipe]);

			const result = await listFavoriteRecipes(TEST_USER.id);
			expect(typeof result[0].logCount).toBe('number');
			expect(typeof result[0].calories).toBe('number');
			expect(typeof result[0].protein).toBe('number');
		});

		test('includes recipe metadata fields', async () => {
			const favRecipe = {
				...TEST_RECIPE,
				isFavorite: true,
				logCount: 1,
				calories: 300,
				protein: 15,
				carbs: 40,
				fat: 8,
				fiber: 5
			};
			setResult([favRecipe]);

			const result = await listFavoriteRecipes(TEST_USER.id);
			expect(result[0].id).toBe(TEST_RECIPE.id);
			expect(result[0].name).toBe(TEST_RECIPE.name);
			expect(result[0].totalServings).toBe(TEST_RECIPE.totalServings);
			expect(result[0].imageUrl).toBe(TEST_RECIPE.imageUrl);
		});
	});
});
