import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_FOOD, TEST_FOOD_2 } from '../helpers/fixtures';
import type { foods as foodsTable } from '$lib/server/schema';

type Food = typeof foodsTable.$inferSelect;

const food = (overrides: Partial<Food>): Food => ({ ...TEST_FOOD, ...overrides }) as Food;
const food2 = (overrides: Partial<Food>): Food => ({ ...TEST_FOOD_2, ...overrides }) as Food;

const { db, setResult, reset } = createMockDB();

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { mergeFoods, computeMergedFood, applyOverrides } = await import('$lib/server/food-merge');

describe('computeMergedFood', () => {
	test('keeper wins when both have a value', () => {
		const merged = computeMergedFood(
			food({ name: 'Oats Premium' }),
			food2({ name: 'Oats Generic' })
		);
		expect(merged.name).toBe('Oats Premium');
	});

	test('source fills empty keeper field', () => {
		const merged = computeMergedFood(food({ brand: null }), food2({ brand: 'Generic Brand' }));
		expect(merged.brand).toBe('Generic Brand');
	});

	test('treats empty string as empty', () => {
		const merged = computeMergedFood(food({ brand: '   ' }), food2({ brand: 'Filled' }));
		expect(merged.brand).toBe('Filled');
	});

	test('treats empty array as empty (additives)', () => {
		const merged = computeMergedFood(food({ additives: [] }), food2({ additives: ['e330'] }));
		expect(merged.additives).toEqual(['e330']);
	});

	test('keeper non-empty array wins over source array', () => {
		const merged = computeMergedFood(food({ additives: ['e100'] }), food2({ additives: ['e330'] }));
		expect(merged.additives).toEqual(['e100']);
	});

	test('isFavorite is OR of both', () => {
		expect(
			computeMergedFood(food({ isFavorite: false }), food2({ isFavorite: true })).isFavorite
		).toBe(true);
		expect(
			computeMergedFood(food({ isFavorite: true }), food2({ isFavorite: false })).isFavorite
		).toBe(true);
		expect(
			computeMergedFood(food({ isFavorite: false }), food2({ isFavorite: false })).isFavorite
		).toBe(false);
	});

	test('keeper barcode wins over source barcode', () => {
		const merged = computeMergedFood(food({ barcode: '111' }), food2({ barcode: '222' }));
		expect(merged.barcode).toBe('111');
	});

	test('source barcode adopted when keeper has none', () => {
		const merged = computeMergedFood(food({ barcode: null }), food2({ barcode: '999' }));
		expect(merged.barcode).toBe('999');
	});

	test('extended nutrient gap is filled from source', () => {
		const merged = computeMergedFood(
			food({ sodium: null, sugar: null }),
			food2({ sodium: 200, sugar: 5 })
		);
		expect(merged.sodium).toBe(200);
		expect(merged.sugar).toBe(5);
	});

	test('extended nutrient kept when keeper has it', () => {
		const merged = computeMergedFood(food({ sodium: 100 }), food2({ sodium: 999 }));
		expect(merged.sodium).toBe(100);
	});

	test('quality fields fill from source when missing', () => {
		const merged = computeMergedFood(
			food({ nutriScore: null, novaGroup: null, ingredientsText: null, imageUrl: null }),
			food2({
				nutriScore: 'b',
				novaGroup: 2,
				ingredientsText: 'oats, water',
				imageUrl: '/img/x.jpg'
			})
		);
		expect(merged.nutriScore).toBe('b');
		expect(merged.novaGroup).toBe(2);
		expect(merged.ingredientsText).toBe('oats, water');
		expect(merged.imageUrl).toBe('/img/x.jpg');
	});
});

describe('applyOverrides', () => {
	test('overrides whitelisted fields', () => {
		const merged = { name: 'Oats', brand: 'A' };
		const result = applyOverrides(merged, { brand: 'B' });
		expect(result.brand).toBe('B');
	});

	test('ignores unknown fields', () => {
		const merged = { name: 'Oats' };
		const result = applyOverrides(merged, { evilField: 'pwned', userId: 'attacker' });
		expect(result).not.toHaveProperty('evilField');
		expect(result).not.toHaveProperty('userId');
	});

	test('returns merged unchanged when overrides undefined', () => {
		const merged = { name: 'Oats' };
		const result = applyOverrides(merged, undefined);
		expect(result).toEqual(merged);
	});

	test('null override is applied (clears a field)', () => {
		const merged = { brand: 'A' };
		const result = applyOverrides(merged, { brand: null });
		expect(result.brand).toBeNull();
	});
});

describe('mergeFoods (validation)', () => {
	beforeEach(() => reset());

	test('rejects empty source list', async () => {
		const result = await mergeFoods(TEST_USER.id, {
			keeperId: TEST_FOOD.id,
			sourceIds: []
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect((result.error as { status?: number }).status).toBe(400);
		}
	});

	test('rejects merging a food into itself', async () => {
		const result = await mergeFoods(TEST_USER.id, {
			keeperId: TEST_FOOD.id,
			sourceIds: [TEST_FOOD.id]
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect((result.error as { status?: number }).status).toBe(400);
		}
	});

	test('returns 404 when food rows not found', async () => {
		setResult([]);
		const result = await mergeFoods(TEST_USER.id, {
			keeperId: TEST_FOOD.id,
			sourceIds: [TEST_FOOD_2.id]
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect((result.error as { status?: number }).status).toBe(404);
		}
	});
});
