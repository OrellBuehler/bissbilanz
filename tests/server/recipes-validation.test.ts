import { describe, expect, test } from 'bun:test';
import { recipeCreateSchema } from '../../src/lib/server/validation';

describe('recipeCreateSchema', () => {
	test('requires name and ingredients', () => {
		const result = recipeCreateSchema.safeParse({ name: 'Shake' });
		expect(result.success).toBe(false);
	});

	test('validates complete recipe', () => {
		const result = recipeCreateSchema.safeParse({
			name: 'Shake',
			totalServings: 2,
			ingredients: [{ foodId: '00000000-0000-0000-0000-000000000000', quantity: 1, servingUnit: 'cup' }]
		});
		expect(result.success).toBe(true);
	});
});
