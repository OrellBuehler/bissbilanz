import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockDB } from '../helpers/mock-db';
import {
	TEST_USER,
	TEST_FOOD,
	TEST_ENTRY,
	TEST_RECIPE,
	TEST_GOALS,
	TEST_MEAL_TYPE,
	VALID_FOOD_PAYLOAD,
	VALID_ENTRY_PAYLOAD,
	VALID_RECIPE_PAYLOAD,
	VALID_GOALS_PAYLOAD,
	VALID_MEAL_TYPE_PAYLOAD
} from '../helpers/fixtures';

// Create mock DB
const { db, setResult, setError, reset } = createMockDB();

// Mock modules
mock.module('$lib/server/db', () => ({
	getDB: () => db
}));

// Import after mocking
const { createFood, updateFood } = await import('$lib/server/foods');
const { createEntry, updateEntry } = await import('$lib/server/entries');
const { createRecipe, updateRecipe } = await import('$lib/server/recipes');
const { upsertGoals } = await import('$lib/server/goals');
const { createMealType, updateMealType } = await import('$lib/server/meal-types');

describe('Database error handling', () => {
	beforeEach(() => {
		reset();
	});

	describe('database throws on insert/update (connection errors, constraint violations)', () => {
		test('createFood catches database error and returns Result failure', async () => {
			setError(new Error('connection refused'));

			const result = await createFood(TEST_USER.id, VALID_FOOD_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('connection refused');
			}
		});

		test('updateFood catches database error and returns Result failure', async () => {
			setError(new Error('connection timeout'));

			const result = await updateFood(TEST_USER.id, TEST_FOOD.id, { name: 'New Name' });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('connection timeout');
			}
		});

		test('createEntry catches database error and returns Result failure', async () => {
			setError(new Error('duplicate key value violates unique constraint'));

			const result = await createEntry(TEST_USER.id, VALID_ENTRY_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toContain('duplicate key');
			}
		});

		test('updateEntry catches database error and returns Result failure', async () => {
			setError(new Error('deadlock detected'));

			const result = await updateEntry(TEST_USER.id, TEST_ENTRY.id, { servings: 2 });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('deadlock detected');
			}
		});

		test('createRecipe catches database error and returns Result failure', async () => {
			setError(new Error('foreign key constraint violation'));

			const result = await createRecipe(TEST_USER.id, VALID_RECIPE_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toContain('foreign key');
			}
		});

		test('updateRecipe catches database error and returns Result failure', async () => {
			setError(new Error('relation does not exist'));

			const result = await updateRecipe(TEST_USER.id, TEST_RECIPE.id, { name: 'Updated' });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toContain('relation does not exist');
			}
		});

		test('upsertGoals catches database error and returns Result failure', async () => {
			setError(new Error('out of shared memory'));

			const result = await upsertGoals(TEST_USER.id, VALID_GOALS_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('out of shared memory');
			}
		});

		test('createMealType catches database error and returns Result failure', async () => {
			setError(new Error('too many connections'));

			const result = await createMealType(TEST_USER.id, VALID_MEAL_TYPE_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('too many connections');
			}
		});

		test('updateMealType catches database error and returns Result failure', async () => {
			setError(new Error('SSL connection has been closed unexpectedly'));

			const result = await updateMealType(TEST_USER.id, TEST_MEAL_TYPE.id, { name: 'Updated' });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toContain('SSL connection');
			}
		});
	});

	describe('insert returns empty result (no rows created)', () => {
		test('createFood returns error when insert returns no rows', async () => {
			setResult([undefined]);

			const result = await createFood(TEST_USER.id, VALID_FOOD_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('Failed to create food');
			}
		});

		test('createEntry returns error when insert returns no rows', async () => {
			setResult([undefined]);

			const result = await createEntry(TEST_USER.id, VALID_ENTRY_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('Failed to create entry');
			}
		});

		test('createRecipe returns error when insert returns no rows', async () => {
			setResult([undefined]);

			const result = await createRecipe(TEST_USER.id, VALID_RECIPE_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('Failed to create recipe');
			}
		});

		test('upsertGoals returns error when upsert returns no rows', async () => {
			setResult([undefined]);

			const result = await upsertGoals(TEST_USER.id, VALID_GOALS_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('Failed to upsert goals');
			}
		});

		test('createMealType returns error when insert returns no rows', async () => {
			setResult([undefined]);

			const result = await createMealType(TEST_USER.id, VALID_MEAL_TYPE_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('Failed to create meal type');
			}
		});
	});

	describe('update returns no matching rows (not found)', () => {
		test('updateFood returns undefined data when no rows match', async () => {
			setResult([]);

			const result = await updateFood(TEST_USER.id, 'nonexistent-id', { name: 'New' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});

		test('updateEntry returns undefined data when no rows match', async () => {
			setResult([]);

			const result = await updateEntry(TEST_USER.id, 'nonexistent-id', { servings: 2 });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});

		test('updateRecipe returns undefined data when no rows match', async () => {
			setResult([]);

			const result = await updateRecipe(TEST_USER.id, 'nonexistent-id', { name: 'New' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});

		test('updateMealType returns undefined data when no rows match', async () => {
			setResult([]);

			const result = await updateMealType(TEST_USER.id, 'nonexistent-id', { name: 'New' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});
	});

	describe('error does not leak database details', () => {
		test('database error is captured as Error object, not raw string', async () => {
			setError(new Error('ERROR: relation "foods" does not exist at character 15'));

			const result = await createFood(TEST_USER.id, VALID_FOOD_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBeInstanceOf(Error);
				expect(typeof result.error.message).toBe('string');
			}
		});

		test('constraint violation error is typed as Error', async () => {
			setError(
				new Error(
					'duplicate key value violates unique constraint "foods_user_id_barcode_unique"'
				)
			);

			const result = await createFood(TEST_USER.id, VALID_FOOD_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBeInstanceOf(Error);
			}
		});
	});
});
