import { describe, test, expect } from 'bun:test';
import { recipeCreateSchema, recipeUpdateSchema } from '../../src/lib/server/validation';

describe('recipeCreateSchema - extended', () => {
	const validRecipe = {
		name: 'Protein Shake',
		totalServings: 2,
		ingredients: [
			{ foodId: '00000000-0000-0000-0000-000000000000', quantity: 1, servingUnit: 'cup' }
		]
	};

	test('validates complete recipe', () => {
		const result = recipeCreateSchema.safeParse(validRecipe);
		expect(result.success).toBe(true);
	});

	test('rejects missing name', () => {
		const result = recipeCreateSchema.safeParse({
			totalServings: 2,
			ingredients: validRecipe.ingredients
		});
		expect(result.success).toBe(false);
	});

	test('rejects empty name', () => {
		const result = recipeCreateSchema.safeParse({
			...validRecipe,
			name: ''
		});
		expect(result.success).toBe(false);
	});

	test('rejects missing ingredients', () => {
		const result = recipeCreateSchema.safeParse({
			name: 'Shake'
		});
		expect(result.success).toBe(false);
	});

	test('rejects empty ingredients array', () => {
		const result = recipeCreateSchema.safeParse({
			name: 'Shake',
			totalServings: 2,
			ingredients: []
		});
		expect(result.success).toBe(false);
	});

	test('rejects ingredient with invalid foodId format', () => {
		const result = recipeCreateSchema.safeParse({
			name: 'Shake',
			totalServings: 2,
			ingredients: [{ foodId: 'not-a-uuid', quantity: 1, servingUnit: 'g' }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects ingredient with zero quantity', () => {
		const result = recipeCreateSchema.safeParse({
			name: 'Shake',
			totalServings: 2,
			ingredients: [
				{ foodId: '00000000-0000-0000-0000-000000000000', quantity: 0, servingUnit: 'g' }
			]
		});
		expect(result.success).toBe(false);
	});

	test('rejects ingredient with negative quantity', () => {
		const result = recipeCreateSchema.safeParse({
			name: 'Shake',
			totalServings: 2,
			ingredients: [
				{ foodId: '00000000-0000-0000-0000-000000000000', quantity: -1, servingUnit: 'g' }
			]
		});
		expect(result.success).toBe(false);
	});

	test('rejects zero totalServings', () => {
		const result = recipeCreateSchema.safeParse({
			...validRecipe,
			totalServings: 0
		});
		expect(result.success).toBe(false);
	});

	test('rejects negative totalServings', () => {
		const result = recipeCreateSchema.safeParse({
			...validRecipe,
			totalServings: -1
		});
		expect(result.success).toBe(false);
	});

	test('accepts multiple ingredients', () => {
		const result = recipeCreateSchema.safeParse({
			name: 'Shake',
			totalServings: 2,
			ingredients: [
				{ foodId: '10000000-0000-4000-8000-000000000001', quantity: 100, servingUnit: 'g' },
				{ foodId: '10000000-0000-4000-8000-000000000002', quantity: 200, servingUnit: 'ml' },
				{ foodId: '10000000-0000-4000-8000-000000000003', quantity: 1, servingUnit: 'tsp' }
			]
		});
		expect(result.success).toBe(true);
	});

	test('coerces string totalServings to number', () => {
		const result = recipeCreateSchema.safeParse({
			...validRecipe,
			totalServings: '4'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.totalServings).toBe(4);
		}
	});

	test('coerces string ingredient quantity to number', () => {
		const result = recipeCreateSchema.safeParse({
			name: 'Shake',
			totalServings: 2,
			ingredients: [
				{ foodId: '00000000-0000-0000-0000-000000000000', quantity: '50', servingUnit: 'g' }
			]
		});
		expect(result.success).toBe(true);
	});

	test('rejects empty object', () => {
		const result = recipeCreateSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});

describe('recipeUpdateSchema', () => {
	test('allows updating name only', () => {
		const result = recipeUpdateSchema.safeParse({ name: 'Updated Shake' });
		expect(result.success).toBe(true);
	});

	test('allows updating totalServings only', () => {
		const result = recipeUpdateSchema.safeParse({ totalServings: 4 });
		expect(result.success).toBe(true);
	});

	test('allows updating ingredients', () => {
		const result = recipeUpdateSchema.safeParse({
			ingredients: [
				{ foodId: '00000000-0000-0000-0000-000000000000', quantity: 100, servingUnit: 'g' }
			]
		});
		expect(result.success).toBe(true);
	});

	test('allows empty update', () => {
		const result = recipeUpdateSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	test('rejects empty name in update', () => {
		const result = recipeUpdateSchema.safeParse({ name: '' });
		expect(result.success).toBe(false);
	});

	test('rejects zero totalServings in update', () => {
		const result = recipeUpdateSchema.safeParse({ totalServings: 0 });
		expect(result.success).toBe(false);
	});
});
