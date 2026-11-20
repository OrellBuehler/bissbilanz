import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ApiError } from '../../src/lib/server/errors';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_MEAL_TYPE, VALID_MEAL_TYPE_PAYLOAD } from '../helpers/fixtures';

// Create mock DB
const { db, setResult, setError, queueResults, reset, getCalls } = createMockDB();

// Import schema for re-export in mock
const schema = await import('$lib/server/schema');

// Mock modules
vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

// Import after mocking
const { listMealTypes, createMealType, updateMealType, renameMealType, deleteMealType } =
	await import('$lib/server/meal-types');

describe('meal-types-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('listMealTypes', () => {
		test('returns meal types sorted by sortOrder', async () => {
			const mealTypes = [
				{ ...TEST_MEAL_TYPE, sortOrder: 1, name: 'Breakfast' },
				{ ...TEST_MEAL_TYPE, sortOrder: 2, name: 'Lunch' },
				{ ...TEST_MEAL_TYPE, sortOrder: 3, name: 'Dinner' }
			];
			setResult(mealTypes);

			const result = await listMealTypes(TEST_USER.id);
			expect(result).toEqual(mealTypes);
		});

		test('returns empty array when no meal types exist', async () => {
			setResult([]);
			const result = await listMealTypes(TEST_USER.id);
			expect(result).toEqual([]);
		});
	});

	describe('createMealType', () => {
		test('creates meal type with valid input', async () => {
			const newMealType = { ...TEST_MEAL_TYPE };
			setResult([newMealType]);

			const result = await createMealType(TEST_USER.id, VALID_MEAL_TYPE_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual(newMealType);
			}
		});

		test('creates meal type with custom sortOrder', async () => {
			const customPayload = { name: 'Snack', sortOrder: 5 };
			const newMealType = { ...TEST_MEAL_TYPE, name: 'Snack', sortOrder: 5 };
			setResult([newMealType]);

			const result = await createMealType(TEST_USER.id, customPayload);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.sortOrder).toBe(5);
				expect(result.data.name).toBe('Snack');
			}
		});
	});

	describe('updateMealType', () => {
		test('updates meal type name', async () => {
			const updated = { ...TEST_MEAL_TYPE, name: 'Post-Workout' };
			setResult([updated]);

			const result = await updateMealType(TEST_USER.id, TEST_MEAL_TYPE.id, {
				name: 'Post-Workout'
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.name).toBe('Post-Workout');
			}
		});

		test('updates meal type sortOrder', async () => {
			const updated = { ...TEST_MEAL_TYPE, sortOrder: 20 };
			setResult([updated]);

			const result = await updateMealType(TEST_USER.id, TEST_MEAL_TYPE.id, { sortOrder: 20 });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.sortOrder).toBe(20);
			}
		});

		test('updates both name and sortOrder', async () => {
			const updated = { ...TEST_MEAL_TYPE, name: 'Late Night Snack', sortOrder: 99 };
			setResult([updated]);

			const result = await updateMealType(TEST_USER.id, TEST_MEAL_TYPE.id, {
				name: 'Late Night Snack',
				sortOrder: 99
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.name).toBe('Late Night Snack');
				expect(result.data?.sortOrder).toBe(99);
			}
		});

		test('returns undefined when meal type not found', async () => {
			setResult([]);
			const result = await updateMealType(TEST_USER.id, 'nonexistent-id', { name: 'New Name' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});
	});

	describe('renameMealType', () => {
		const writes = () => getCalls().filter((call) => call.method === 'update');

		test('renames and carries reminders, time windows and the meal order in one transaction', async () => {
			const renamed = { ...TEST_MEAL_TYPE, name: 'Gym', sortOrder: 4 };
			queueResults([[{ name: 'Pre-Workout' }], [renamed], [], [], []]);
			expect(
				await renameMealType(TEST_USER.id, TEST_MEAL_TYPE.id, { name: 'Gym', sortOrder: 4 })
			).toEqual({ success: true, data: renamed });
			expect(getCalls()[0]?.method).toBe('transaction');
			expect(writes()).toHaveLength(4);
		});

		test('a same-name update writes only the meal type', async () => {
			queueResults([[{ name: 'Pre-Workout' }], [TEST_MEAL_TYPE]]);
			expect(
				await renameMealType(TEST_USER.id, TEST_MEAL_TYPE.id, { name: 'Pre-Workout' })
			).toEqual({ success: true, data: TEST_MEAL_TYPE });
			expect(writes()).toHaveLength(1);
		});

		test('another user’s or an unknown meal type changes nothing', async () => {
			queueResults([[]]);
			expect(await renameMealType(TEST_USER.id, TEST_MEAL_TYPE.id, { name: 'Gym' })).toEqual({
				success: true,
				data: undefined
			});
			expect(writes()).toHaveLength(0);
		});

		test('a failing statement fails the whole rename and reaches the caller', async () => {
			setError(new Error('Failed query: update "reminders"'));
			const result = await renameMealType(TEST_USER.id, TEST_MEAL_TYPE.id, { name: 'Gym' });
			expect(result.success).toBe(false);
		});

		test('rejects an empty name before any statement', async () => {
			const result = await renameMealType(TEST_USER.id, TEST_MEAL_TYPE.id, { name: '' });
			expect(result.success).toBe(false);
			expect(getCalls()).toHaveLength(0);
		});
	});

	describe('deleteMealType', () => {
		test('deletes meal type', async () => {
			setResult(undefined); // DELETE returns void
			await deleteMealType(TEST_USER.id, TEST_MEAL_TYPE.id);
			// No assertion needed - just verifies it doesn't throw
		});

		test('does not throw when deleting nonexistent meal type', async () => {
			setResult(undefined);
			await deleteMealType(TEST_USER.id, 'nonexistent-id');
			// No assertion needed - just verifies it doesn't throw
		});

		test('throws conflict when meal type is referenced by favorites timeframes', async () => {
			setError(Object.assign(new Error('fk violation'), { code: '23503' }));

			try {
				await deleteMealType(TEST_USER.id, TEST_MEAL_TYPE.id);
				throw new Error('Expected deleteMealType to throw');
			} catch (error) {
				expect(error).toBeInstanceOf(ApiError);
				const apiError = error as ApiError;
				expect(apiError.status).toBe(409);
			}
		});
	});
});
