import { describe, expect, test, vi } from 'vitest';
import { toMealTypeInsert } from '../../src/lib/server/meal-types';
import { mealTypeCreateSchema, mealTypeUpdateSchema } from '../../src/lib/server/validation';

vi.mock('$lib/server/db', () => ({
	getDB: () => {
		throw new Error('DB should not be called in pure unit tests');
	}
}));

const { createMealType, updateMealType } = await import('$lib/server/meal-types');

describe('toMealTypeInsert', () => {
	test('maps meal type input to row', () => {
		const row = toMealTypeInsert('user-1', { name: 'Second Breakfast', sortOrder: 3 });
		expect(row.userId).toBe('user-1');
		expect(row.name).toBe('Second Breakfast');
	});

	test('maps sortOrder correctly', () => {
		const row = toMealTypeInsert('user-1', { name: 'Snack', sortOrder: 99 });
		expect(row.sortOrder).toBe(99);
	});

	test('maps all fields onto the returned object', () => {
		const row = toMealTypeInsert('user-abc', { name: 'Late Night', sortOrder: 0 });
		expect(row).toEqual({ userId: 'user-abc', name: 'Late Night', sortOrder: 0 });
	});

	test('preserves sortOrder of zero', () => {
		const row = toMealTypeInsert('user-1', { name: 'Breakfast', sortOrder: 0 });
		expect(row.sortOrder).toBe(0);
	});
});

describe('mealTypeCreateSchema', () => {
	test('validates a complete valid payload', () => {
		const result = mealTypeCreateSchema.safeParse({ name: 'Brunch', sortOrder: 2 });
		expect(result.success).toBe(true);
	});

	test('accepts sortOrder of zero', () => {
		const result = mealTypeCreateSchema.safeParse({ name: 'Early Breakfast', sortOrder: 0 });
		expect(result.success).toBe(true);
	});

	test('accepts large sortOrder', () => {
		const result = mealTypeCreateSchema.safeParse({ name: 'Late Snack', sortOrder: 999 });
		expect(result.success).toBe(true);
	});

	test('rejects missing name', () => {
		const result = mealTypeCreateSchema.safeParse({ sortOrder: 1 });
		expect(result.success).toBe(false);
	});

	test('rejects empty name', () => {
		const result = mealTypeCreateSchema.safeParse({ name: '', sortOrder: 1 });
		expect(result.success).toBe(false);
	});

	test('rejects name longer than 50 characters', () => {
		const result = mealTypeCreateSchema.safeParse({
			name: 'A'.repeat(51),
			sortOrder: 1
		});
		expect(result.success).toBe(false);
	});

	test('accepts name of exactly 50 characters', () => {
		const result = mealTypeCreateSchema.safeParse({
			name: 'A'.repeat(50),
			sortOrder: 1
		});
		expect(result.success).toBe(true);
	});

	test('rejects missing sortOrder', () => {
		const result = mealTypeCreateSchema.safeParse({ name: 'Dinner' });
		expect(result.success).toBe(false);
	});

	test('rejects negative sortOrder', () => {
		const result = mealTypeCreateSchema.safeParse({ name: 'Dinner', sortOrder: -1 });
		expect(result.success).toBe(false);
	});

	test('rejects non-integer sortOrder', () => {
		const result = mealTypeCreateSchema.safeParse({ name: 'Dinner', sortOrder: 1.5 });
		expect(result.success).toBe(false);
	});

	test('rejects empty object', () => {
		const result = mealTypeCreateSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});

describe('mealTypeUpdateSchema', () => {
	test('allows updating only name', () => {
		const result = mealTypeUpdateSchema.safeParse({ name: 'Brunch' });
		expect(result.success).toBe(true);
	});

	test('allows updating only sortOrder', () => {
		const result = mealTypeUpdateSchema.safeParse({ sortOrder: 5 });
		expect(result.success).toBe(true);
	});

	test('allows updating both fields', () => {
		const result = mealTypeUpdateSchema.safeParse({ name: 'Brunch', sortOrder: 5 });
		expect(result.success).toBe(true);
	});

	test('allows empty update', () => {
		const result = mealTypeUpdateSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	test('rejects empty name', () => {
		const result = mealTypeUpdateSchema.safeParse({ name: '' });
		expect(result.success).toBe(false);
	});

	test('rejects name longer than 50 characters', () => {
		const result = mealTypeUpdateSchema.safeParse({ name: 'A'.repeat(51) });
		expect(result.success).toBe(false);
	});

	test('rejects negative sortOrder', () => {
		const result = mealTypeUpdateSchema.safeParse({ sortOrder: -1 });
		expect(result.success).toBe(false);
	});

	test('rejects non-integer sortOrder', () => {
		const result = mealTypeUpdateSchema.safeParse({ sortOrder: 2.7 });
		expect(result.success).toBe(false);
	});

	test('accepts sortOrder of zero', () => {
		const result = mealTypeUpdateSchema.safeParse({ sortOrder: 0 });
		expect(result.success).toBe(true);
	});
});

describe('createMealType validation rejection', () => {
	test('returns failure for missing name', async () => {
		const result = await createMealType('user-1', { sortOrder: 1 });
		expect(result.success).toBe(false);
	});

	test('returns failure for empty name', async () => {
		const result = await createMealType('user-1', { name: '', sortOrder: 1 });
		expect(result.success).toBe(false);
	});

	test('returns failure for missing sortOrder', async () => {
		const result = await createMealType('user-1', { name: 'Dinner' });
		expect(result.success).toBe(false);
	});

	test('returns failure for negative sortOrder', async () => {
		const result = await createMealType('user-1', { name: 'Dinner', sortOrder: -1 });
		expect(result.success).toBe(false);
	});

	test('returns failure for null input', async () => {
		const result = await createMealType('user-1', null);
		expect(result.success).toBe(false);
	});
});

describe('updateMealType validation rejection', () => {
	test('returns failure for empty name', async () => {
		const result = await updateMealType('user-1', 'meal-type-id', { name: '' });
		expect(result.success).toBe(false);
	});

	test('returns failure for negative sortOrder', async () => {
		const result = await updateMealType('user-1', 'meal-type-id', { sortOrder: -5 });
		expect(result.success).toBe(false);
	});

	test('returns failure for non-integer sortOrder', async () => {
		const result = await updateMealType('user-1', 'meal-type-id', { sortOrder: 1.5 });
		expect(result.success).toBe(false);
	});

	test('returns failure for null input', async () => {
		const result = await updateMealType('user-1', 'meal-type-id', null);
		expect(result.success).toBe(false);
	});
});
