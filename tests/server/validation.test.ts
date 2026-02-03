import { describe, expect, test } from 'bun:test';
import { foodCreateSchema, entryCreateSchema, goalsSchema } from '../../src/lib/server/validation';

describe('validation schemas', () => {
	test('foodCreateSchema requires name and macros', () => {
		const result = foodCreateSchema.safeParse({ name: 'Eggs' });
		expect(result.success).toBe(false);
	});

	test('entryCreateSchema coerces numeric values', () => {
		const result = entryCreateSchema.parse({
			foodId: '00000000-0000-0000-0000-000000000000',
			mealType: 'Breakfast',
			servings: '2',
			date: '2026-02-03'
		});
		expect(result.servings).toBe(2);
	});

	test('goalsSchema requires all macro goals', () => {
		const result = goalsSchema.safeParse({ calorieGoal: 2000 });
		expect(result.success).toBe(false);
	});
});
