import { describe, test, expect } from 'vitest';
import { entryCreateSchema, entryUpdateSchema } from '../../src/lib/server/validation';

describe('entryCreateSchema', () => {
	// Use valid RFC 4122 v4 UUIDs (version=4, variant=8/9/a/b)
	const VALID_UUID_1 = '10000000-0000-4000-8000-000000000001';
	const VALID_UUID_2 = '10000000-0000-4000-8000-000000000002';

	const validEntry = {
		foodId: VALID_UUID_1,
		mealType: 'breakfast',
		servings: 1.5,
		date: '2026-02-10'
	};

	test('validates entry with foodId', () => {
		const result = entryCreateSchema.safeParse(validEntry);
		expect(result.success).toBe(true);
	});

	test('validates entry with recipeId', () => {
		const result = entryCreateSchema.safeParse({
			recipeId: VALID_UUID_2,
			mealType: 'lunch',
			servings: 1,
			date: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('rejects entry with neither foodId nor recipeId', () => {
		const result = entryCreateSchema.safeParse({
			mealType: 'breakfast',
			servings: 1,
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('accepts entry with both foodId and recipeId (schema level)', () => {
		// The schema's refine only requires at least one, not mutual exclusivity
		const result = entryCreateSchema.safeParse({
			foodId: VALID_UUID_1,
			recipeId: VALID_UUID_2,
			mealType: 'breakfast',
			servings: 1,
			date: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('rejects missing mealType', () => {
		const result = entryCreateSchema.safeParse({
			foodId: VALID_UUID_1,
			servings: 1,
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects empty mealType', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			mealType: ''
		});
		expect(result.success).toBe(false);
	});

	test('rejects missing servings', () => {
		const result = entryCreateSchema.safeParse({
			foodId: VALID_UUID_1,
			mealType: 'breakfast',
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects zero servings', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			servings: 0
		});
		expect(result.success).toBe(false);
	});

	test('rejects negative servings', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			servings: -1
		});
		expect(result.success).toBe(false);
	});

	test('rejects missing date', () => {
		const result = entryCreateSchema.safeParse({
			foodId: VALID_UUID_1,
			mealType: 'breakfast',
			servings: 1
		});
		expect(result.success).toBe(false);
	});

	test('rejects invalid date format', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			date: '02-10-2026'
		});
		expect(result.success).toBe(false);
	});

	test('rejects date with time suffix', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			date: '2026-02-10T08:00:00Z'
		});
		expect(result.success).toBe(false);
	});

	test('rejects invalid UUID for foodId', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			foodId: 'not-a-uuid'
		});
		expect(result.success).toBe(false);
	});

	test('accepts fractional servings', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			servings: 0.5
		});
		expect(result.success).toBe(true);
	});

	test('accepts optional notes', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			notes: 'With honey'
		});
		expect(result.success).toBe(true);
	});

	test('accepts null notes', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			notes: null
		});
		expect(result.success).toBe(true);
	});

	test('coerces string servings to number', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			servings: '2'
		});
		expect(result.success).toBe(true);
	});

	test('normalizes mealType via transform', () => {
		const result = entryCreateSchema.safeParse({
			...validEntry,
			mealType: 'breakfast'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			// normalizeMealType maps 'breakfast' -> 'Breakfast'
			expect(result.data.mealType).toBe('Breakfast');
		}
	});
});

describe('entryUpdateSchema', () => {
	test('allows updating servings only', () => {
		const result = entryUpdateSchema.safeParse({ servings: 2 });
		expect(result.success).toBe(true);
	});

	test('allows updating mealType only', () => {
		const result = entryUpdateSchema.safeParse({ mealType: 'lunch' });
		expect(result.success).toBe(true);
	});

	test('allows updating notes only', () => {
		const result = entryUpdateSchema.safeParse({ notes: 'Updated note' });
		expect(result.success).toBe(true);
	});

	test('allows empty update', () => {
		const result = entryUpdateSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	test('rejects negative servings in update', () => {
		const result = entryUpdateSchema.safeParse({ servings: -1 });
		expect(result.success).toBe(false);
	});

	test('rejects zero servings in update', () => {
		const result = entryUpdateSchema.safeParse({ servings: 0 });
		expect(result.success).toBe(false);
	});

	test('rejects invalid date format in update', () => {
		const result = entryUpdateSchema.safeParse({ date: 'bad' });
		expect(result.success).toBe(false);
	});
});
