import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_FOOD, TEST_FOOD_2, VALID_FOOD_PAYLOAD } from '../helpers/fixtures';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

// Create mock DB
const { db, setResult, setError, reset } = createMockDB();

// Import schema for re-export in mock
const schema = await import('$lib/server/schema');

// Mock modules
vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

// Import after mocking
const {
	listFoods,
	createFood,
	updateFood,
	deleteFood,
	findFoodByBarcode,
	listRecentFoods,
	toFoodInsert
} = await import('$lib/server/foods');

describe('foods-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('listFoods', () => {
		test('returns all foods for user', async () => {
			const foods = [TEST_FOOD, TEST_FOOD_2];
			setResult(foods);

			const result = await listFoods(TEST_USER.id);
			expect(result.items).toEqual(foods);
		});

		test('filters foods by query string', async () => {
			setResult([TEST_FOOD]);

			const result = await listFoods(TEST_USER.id, { query: 'oat' });
			expect(result.items).toEqual([TEST_FOOD]);
		});

		test('applies pagination with limit and offset', async () => {
			setResult([TEST_FOOD]);

			const result = await listFoods(TEST_USER.id, { limit: 10, offset: 5 });
			expect(result.items).toEqual([TEST_FOOD]);
		});

		test('uses default pagination values', async () => {
			setResult([TEST_FOOD, TEST_FOOD_2]);

			const result = await listFoods(TEST_USER.id, {});
			expect(result.items.length).toBe(2);
		});

		test('returns empty array when no foods exist', async () => {
			setResult([]);

			const result = await listFoods(TEST_USER.id);
			expect(result.items).toEqual([]);
		});
	});

	describe('createFood', () => {
		test('creates food with valid payload', async () => {
			const newFood = { ...TEST_FOOD };
			setResult([newFood]);

			const result = await createFood(TEST_USER.id, VALID_FOOD_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual(newFood);
			}
		});

		test('returns validation error on missing required fields', async () => {
			const invalidPayload = {
				name: 'Incomplete Food'
				// missing servingSize, servingUnit, calories, etc.
			};

			const result = await createFood(TEST_USER.id, invalidPayload);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error on negative calories', async () => {
			const invalidPayload = {
				...VALID_FOOD_PAYLOAD,
				calories: -100
			};

			const result = await createFood(TEST_USER.id, invalidPayload);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('creates food with optional advanced nutrients', async () => {
			const payloadWithNutrients = {
				...VALID_FOOD_PAYLOAD,
				sodium: 200,
				sugar: 5,
				saturatedFat: 2.5,
				cholesterol: 10
			};
			const newFood = { ...TEST_FOOD, sodium: 200, sugar: 5, saturatedFat: 2.5, cholesterol: 10 };
			setResult([newFood]);

			const result = await createFood(TEST_USER.id, payloadWithNutrients);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.sodium).toBe(200);
				expect(result.data.sugar).toBe(5);
			}
		});
	});

	describe('updateFood', () => {
		test('updates food with valid payload', async () => {
			const updated = { ...TEST_FOOD, name: 'Steel Cut Oats' };
			setResult([updated]);

			const result = await updateFood(TEST_USER.id, TEST_FOOD.id, { name: 'Steel Cut Oats' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.name).toBe('Steel Cut Oats');
			}
		});

		test('updates partial food fields', async () => {
			const updated = { ...TEST_FOOD, calories: 400 };
			setResult([updated]);

			const result = await updateFood(TEST_USER.id, TEST_FOOD.id, { calories: 400 });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.calories).toBe(400);
			}
		});

		test('returns undefined when food not found', async () => {
			setResult([]);

			const result = await updateFood(TEST_USER.id, 'nonexistent-id', { name: 'New Name' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});

		test('updates isFavorite flag', async () => {
			const updated = { ...TEST_FOOD, isFavorite: true };
			setResult([updated]);

			const result = await updateFood(TEST_USER.id, TEST_FOOD.id, { isFavorite: true });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.isFavorite).toBe(true);
			}
		});
	});

	describe('deleteFood', () => {
		test('deletes food', async () => {
			setResult([{ count: 0 }]);
			const result = await deleteFood(TEST_USER.id, TEST_FOOD.id);
			expect(result.blocked).toBe(false);
		});

		test('does not throw when deleting nonexistent food', async () => {
			setResult([{ count: 0 }]);
			const result = await deleteFood(TEST_USER.id, 'nonexistent-id');
			expect(result.blocked).toBe(false);
		});
	});

	describe('findFoodByBarcode', () => {
		test('returns food when barcode matches', async () => {
			setResult([TEST_FOOD]);

			const result = await findFoodByBarcode(TEST_USER.id, '1234567890123');
			expect(result).toEqual(TEST_FOOD);
		});

		test('returns null when barcode not found', async () => {
			setResult([]);

			const result = await findFoodByBarcode(TEST_USER.id, 'nonexistent-barcode');
			expect(result).toBeNull();
		});
	});

	describe('listRecentFoods', () => {
		test('returns recent foods with join to entries', async () => {
			const recentFoods = [
				{
					id: TEST_FOOD.id,
					name: TEST_FOOD.name,
					brand: TEST_FOOD.brand,
					isFavorite: TEST_FOOD.isFavorite
				}
			];
			setResult(recentFoods);

			const result = await listRecentFoods(TEST_USER.id);
			expect(result).toEqual(recentFoods);
		});

		test('respects custom limit', async () => {
			const recentFoods = [
				{
					id: TEST_FOOD.id,
					name: TEST_FOOD.name,
					brand: TEST_FOOD.brand,
					isFavorite: TEST_FOOD.isFavorite
				}
			];
			setResult(recentFoods);

			const result = await listRecentFoods(TEST_USER.id, 10);
			expect(result.length).toBe(1);
		});

		test('returns empty array when no recent entries', async () => {
			setResult([]);

			const result = await listRecentFoods(TEST_USER.id);
			expect(result).toEqual([]);
		});
	});

	describe('toFoodInsert', () => {
		test('maps all 43 extended nutrients from input', () => {
			const allNutrients = Object.fromEntries(ALL_NUTRIENT_KEYS.map((k, i) => [k, i + 1]));
			const input = { ...VALID_FOOD_PAYLOAD, ...allNutrients };

			const result = toFoodInsert(TEST_USER.id, input as Parameters<typeof toFoodInsert>[1]);

			for (const key of ALL_NUTRIENT_KEYS) {
				expect(result).toHaveProperty(key);
				expect((result as Record<string, unknown>)[key]).toBe(allNutrients[key]);
			}
		});

		test('defaults missing extended nutrients to null', () => {
			const result = toFoodInsert(
				TEST_USER.id,
				VALID_FOOD_PAYLOAD as Parameters<typeof toFoodInsert>[1]
			);

			for (const key of ALL_NUTRIENT_KEYS) {
				expect((result as Record<string, unknown>)[key]).toBeNull();
			}
		});

		test('maps core fields correctly', () => {
			const result = toFoodInsert(
				TEST_USER.id,
				VALID_FOOD_PAYLOAD as Parameters<typeof toFoodInsert>[1]
			);

			expect(result.userId).toBe(TEST_USER.id);
			expect(result.name).toBe(VALID_FOOD_PAYLOAD.name);
			expect(result.calories).toBe(VALID_FOOD_PAYLOAD.calories);
			expect(result.protein).toBe(VALID_FOOD_PAYLOAD.protein);
			expect(result.carbs).toBe(VALID_FOOD_PAYLOAD.carbs);
			expect(result.fat).toBe(VALID_FOOD_PAYLOAD.fat);
			expect(result.fiber).toBe(VALID_FOOD_PAYLOAD.fiber);
			expect(result.barcode).toBe(VALID_FOOD_PAYLOAD.barcode);
		});

		test('coerces empty string barcode to null', () => {
			const input = { ...VALID_FOOD_PAYLOAD, barcode: '' };
			const result = toFoodInsert(TEST_USER.id, input as Parameters<typeof toFoodInsert>[1]);
			expect(result.barcode).toBeNull();
		});

		test('defaults isFavorite to false when not provided', () => {
			const result = toFoodInsert(
				TEST_USER.id,
				VALID_FOOD_PAYLOAD as Parameters<typeof toFoodInsert>[1]
			);
			expect(result.isFavorite).toBe(false);
		});
	});

	describe('barcode conflict handling', () => {
		test('createFood returns 409 ApiError when barcode is a duplicate', async () => {
			const duplicateError = new Error(
				'duplicate key value violates unique constraint "foods_barcode_unique"'
			);
			setError(duplicateError);

			const result = await createFood(TEST_USER.id, VALID_FOOD_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect((result.error as { status?: number }).status).toBe(409);
				expect(result.error.message).toContain('1234567890123');
			}
		});

		test('createFood propagates non-barcode unique constraint errors unchanged', async () => {
			const otherConstraintError = new Error(
				'duplicate key value violates unique constraint "foods_some_other_constraint"'
			);
			setError(otherConstraintError);

			const result = await createFood(TEST_USER.id, VALID_FOOD_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toContain('some_other_constraint');
				expect((result.error as { status?: number }).status).toBeUndefined();
			}
		});

		test('createFood propagates non-Error throws unchanged', async () => {
			const genericError = new Error('connection refused');
			setError(genericError);

			const result = await createFood(TEST_USER.id, VALID_FOOD_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe(genericError);
			}
		});

		test('updateFood returns 409 ApiError when barcode is a duplicate', async () => {
			const duplicateError = new Error(
				'duplicate key value violates unique constraint "foods_barcode_unique"'
			);
			setError(duplicateError);

			const result = await updateFood(TEST_USER.id, TEST_FOOD.id, {
				barcode: VALID_FOOD_PAYLOAD.barcode
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect((result.error as { status?: number }).status).toBe(409);
			}
		});

		test('createFood without barcode does not trigger conflict resolution on unique constraint error', async () => {
			const duplicateError = new Error(
				'duplicate key value violates unique constraint "foods_barcode_unique"'
			);
			setError(duplicateError);

			const payloadWithoutBarcode = { ...VALID_FOOD_PAYLOAD, barcode: undefined };
			const result = await createFood(TEST_USER.id, payloadWithoutBarcode);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect((result.error as { status?: number }).status).toBeUndefined();
			}
		});
	});
});
