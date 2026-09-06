import { describe, expect, test } from 'vitest';
import {
	MAX_BULK_FOOD_IDS,
	MAX_IMPORT_FOODS,
	foodBatchSchema,
	foodImportSchema
} from '$lib/server/validation/foods';

const ID = '10000000-0000-4000-8000-000000000010';
const ID_2 = '10000000-0000-4000-8000-000000000011';

const validFood = {
	name: 'Oats',
	servingSize: 100,
	servingUnit: 'g',
	calories: 389,
	protein: 13.2,
	carbs: 66.3,
	fat: 6.9,
	fiber: 10.6
};

describe('foodBatchSchema', () => {
	test('accepts a favorite action without a payload', () => {
		const result = foodBatchSchema.safeParse({ ids: [ID, ID_2], action: 'favorite' });
		expect(result.success).toBe(true);
	});

	test('accepts delete with force', () => {
		const result = foodBatchSchema.safeParse({
			ids: [ID],
			action: 'delete',
			payload: { force: true }
		});
		expect(result.success).toBe(true);
	});

	test('rejects an unknown action', () => {
		expect(foodBatchSchema.safeParse({ ids: [ID], action: 'archive' }).success).toBe(false);
	});

	test('rejects an empty id list', () => {
		expect(foodBatchSchema.safeParse({ ids: [], action: 'favorite' }).success).toBe(false);
	});

	test('rejects a non-uuid id', () => {
		expect(foodBatchSchema.safeParse({ ids: ['nope'], action: 'favorite' }).success).toBe(false);
	});

	test('caps the number of ids', () => {
		const ids = Array.from({ length: MAX_BULK_FOOD_IDS + 1 }, () => ID);
		expect(foodBatchSchema.safeParse({ ids, action: 'favorite' }).success).toBe(false);
	});

	test('label actions require labels', () => {
		for (const action of ['add_labels', 'remove_labels', 'set_labels']) {
			expect(foodBatchSchema.safeParse({ ids: [ID], action }).success).toBe(false);
		}
	});

	test('add and remove reject an empty label list, set accepts it as a clear', () => {
		expect(
			foodBatchSchema.safeParse({ ids: [ID], action: 'add_labels', payload: { labels: [] } })
				.success
		).toBe(false);
		expect(
			foodBatchSchema.safeParse({ ids: [ID], action: 'remove_labels', payload: { labels: [] } })
				.success
		).toBe(false);
		expect(
			foodBatchSchema.safeParse({ ids: [ID], action: 'set_labels', payload: { labels: [] } })
				.success
		).toBe(true);
	});

	test('caps labels per request', () => {
		const labels = Array.from({ length: 21 }, (_, i) => `label${i}`);
		expect(
			foodBatchSchema.safeParse({ ids: [ID], action: 'add_labels', payload: { labels } }).success
		).toBe(false);
	});
});

describe('foodImportSchema', () => {
	test('accepts a list of valid foods', () => {
		const result = foodImportSchema.safeParse({ foods: [validFood] });
		expect(result.success).toBe(true);
	});

	test('rejects an empty list', () => {
		expect(foodImportSchema.safeParse({ foods: [] }).success).toBe(false);
	});

	test('rejects a row that is not a valid food', () => {
		const result = foodImportSchema.safeParse({ foods: [{ ...validFood, servingUnit: 'stone' }] });
		expect(result.success).toBe(false);
	});

	test('caps the number of rows', () => {
		const foods = Array.from({ length: MAX_IMPORT_FOODS + 1 }, () => validFood);
		expect(foodImportSchema.safeParse({ foods }).success).toBe(false);
	});

	test('carries extended nutrients through', () => {
		const result = foodImportSchema.safeParse({
			foods: [{ ...validFood, saturatedFat: 1.2, vitaminB12: 0.4 }]
		});
		expect(result.success).toBe(true);
		expect(result.data?.foods[0]).toMatchObject({ saturatedFat: 1.2, vitaminB12: 0.4 });
	});
});
