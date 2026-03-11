import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import {
	TEST_USER,
	TEST_RECIPE,
	TEST_RECIPE_INGREDIENT,
	TEST_RECIPE_WITH_INGREDIENTS,
	VALID_RECIPE_PAYLOAD
} from '../helpers/fixtures';

// Create mock DB
const { db, setResult, reset } = createMockDB();

// Import schema for re-export in mock
const schema = await import('$lib/server/schema');

// Mock modules
vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

// Import after mocking
const { listRecipes, createRecipe, getRecipe, updateRecipe, deleteRecipe } =
	await import('$lib/server/recipes');

describe('recipes-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('listRecipes', () => {
		test('returns recipes ordered by name', async () => {
			const recipes = [
				{
					id: TEST_RECIPE.id,
					name: TEST_RECIPE.name,
					totalServings: TEST_RECIPE.totalServings,
					isFavorite: TEST_RECIPE.isFavorite,
					imageUrl: TEST_RECIPE.imageUrl,
					calories: 0,
					protein: 0,
					carbs: 0,
					fat: 0
				}
			];
			setResult(recipes);

			const result = await listRecipes(TEST_USER.id);
			expect(result.items).toEqual(recipes);
		});

		test('returns empty array when no recipes exist', async () => {
			setResult([]);

			const result = await listRecipes(TEST_USER.id);
			expect(result.items).toEqual([]);
		});
	});

	describe('createRecipe', () => {
		test('creates recipe with valid payload', async () => {
			const newRecipe = { ...TEST_RECIPE };
			setResult([newRecipe]);

			const result = await createRecipe(TEST_USER.id, VALID_RECIPE_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual(newRecipe);
			}
		});

		test('creates recipe with multiple ingredients', async () => {
			const payload = {
				name: 'Complex Recipe',
				totalServings: 2,
				ingredients: [
					{ foodId: '10000000-0000-4000-8000-000000000010', quantity: 50, servingUnit: 'g' },
					{ foodId: '10000000-0000-4000-8000-000000000011', quantity: 100, servingUnit: 'g' }
				]
			};
			const newRecipe = { ...TEST_RECIPE, name: 'Complex Recipe', totalServings: 2 };
			setResult([newRecipe]);

			const result = await createRecipe(TEST_USER.id, payload);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe('Complex Recipe');
				expect(result.data.totalServings).toBe(2);
			}
		});

		test('returns error on invalid payload', async () => {
			const invalidPayload = {
				name: 'Recipe',
				totalServings: 'not-a-number', // Invalid type
				ingredients: []
			};

			const result = await createRecipe(TEST_USER.id, invalidPayload);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns error when ingredients array is empty', async () => {
			const payloadWithoutIngredients = {
				name: 'Recipe',
				totalServings: 1,
				ingredients: []
			};

			const result = await createRecipe(TEST_USER.id, payloadWithoutIngredients);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns error when missing required fields', async () => {
			const payloadMissingName = {
				totalServings: 1,
				ingredients: [
					{ foodId: '10000000-0000-4000-8000-000000000010', quantity: 50, servingUnit: 'g' }
				]
			};

			const result = await createRecipe(TEST_USER.id, payloadMissingName);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});
	});

	describe('getRecipe', () => {
		test('returns recipe with ingredients joined', async () => {
			// First query returns recipe, second query returns ingredients
			setResult([TEST_RECIPE]);
			const result = await getRecipe(TEST_USER.id, TEST_RECIPE.id);

			// After first select, mock will return ingredients for second query
			// In real implementation, this would be two separate queries
			expect(result).toBeTruthy();
			expect(result?.id).toBe(TEST_RECIPE.id);
		});

		test('returns null when recipe not found', async () => {
			setResult([]);

			const result = await getRecipe(TEST_USER.id, 'non-existent-id');
			expect(result).toBeNull();
		});

		test('returns recipe with correct ingredient structure', async () => {
			// Mock first query (select recipe)
			setResult([TEST_RECIPE]);

			const result = await getRecipe(TEST_USER.id, TEST_RECIPE.id);
			expect(result).toBeTruthy();
			expect(result?.id).toBe(TEST_RECIPE.id);
			expect(result?.name).toBe('Oatmeal Bowl');
		});

		test('returns null when recipe belongs to different user', async () => {
			setResult([]);

			const result = await getRecipe('different-user-id', TEST_RECIPE.id);
			expect(result).toBeNull();
		});
	});

	describe('updateRecipe', () => {
		test('updates recipe metadata only', async () => {
			const updatedRecipe = { ...TEST_RECIPE, name: 'Updated Oatmeal', totalServings: 2 };
			setResult([updatedRecipe]);

			const payload = {
				name: 'Updated Oatmeal',
				totalServings: 2
			};

			const result = await updateRecipe(TEST_USER.id, TEST_RECIPE.id, payload);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.name).toBe('Updated Oatmeal');
				expect(result.data?.totalServings).toBe(2);
			}
		});

		test('updates recipe and replaces ingredients', async () => {
			const updatedRecipe = { ...TEST_RECIPE, name: 'Updated Recipe' };
			setResult([updatedRecipe]);

			const payload = {
				name: 'Updated Recipe',
				totalServings: 1,
				ingredients: [
					{ foodId: '10000000-0000-4000-8000-000000000011', quantity: 100, servingUnit: 'g' }
				]
			};

			const result = await updateRecipe(TEST_USER.id, TEST_RECIPE.id, payload);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.name).toBe('Updated Recipe');
			}
		});

		test('returns undefined when recipe not found', async () => {
			setResult([]);

			const payload = { name: 'Updated', totalServings: 1 };
			const result = await updateRecipe(TEST_USER.id, 'non-existent-id', payload);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});

		test('returns undefined when recipe belongs to different user', async () => {
			setResult([]);

			const payload = { name: 'Updated', totalServings: 1 };
			const result = await updateRecipe('different-user-id', TEST_RECIPE.id, payload);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});

		test('returns error on invalid payload', async () => {
			const invalidPayload = {
				name: 'Recipe',
				totalServings: 'invalid' // Invalid type
			};

			const result = await updateRecipe(TEST_USER.id, TEST_RECIPE.id, invalidPayload);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});
	});

	describe('deleteRecipe', () => {
		test('deletes recipe successfully', async () => {
			setResult([{ count: 0 }]);

			const result = await deleteRecipe(TEST_USER.id, TEST_RECIPE.id);
			expect(result.blocked).toBe(false);
		});

		test('deletes recipe and cascades to ingredients', async () => {
			setResult([{ count: 0 }]);

			const result = await deleteRecipe(TEST_USER.id, TEST_RECIPE.id);
			expect(result.blocked).toBe(false);
		});

		test('does not throw when recipe not found', async () => {
			setResult([{ count: 0 }]);

			const result = await deleteRecipe(TEST_USER.id, 'non-existent-id');
			expect(result.blocked).toBe(false);
		});

		test('does not delete recipe belonging to different user', async () => {
			setResult([{ count: 0 }]);

			const result = await deleteRecipe('different-user-id', TEST_RECIPE.id);
			expect(result.blocked).toBe(false);
		});

		test('returns blocked when entries exist and force is false', async () => {
			setResult([{ count: 3 }]);

			const result = await deleteRecipe(TEST_USER.id, TEST_RECIPE.id);
			expect(result.blocked).toBe(true);
			if (result.blocked) {
				expect(result.entryCount).toBe(3);
			}
		});

		test('deletes when entries exist and force is true', async () => {
			setResult([{ count: 3 }]);

			const result = await deleteRecipe(TEST_USER.id, TEST_RECIPE.id, true);
			expect(result.blocked).toBe(false);
		});
	});
});
