import { describe, expect, test } from 'vitest';
import { recipeCreateSchema, recipeUpdateSchema } from '../../src/lib/server/validation';

describe('recipeCreateSchema', () => {
	test('requires name and ingredients', () => {
		const result = recipeCreateSchema.safeParse({ name: 'Shake' });
		expect(result.success).toBe(false);
	});

	test('validates complete recipe', () => {
		const result = recipeCreateSchema.safeParse({
			name: 'Shake',
			totalServings: 2,
			ingredients: [
				{ foodId: '00000000-0000-0000-0000-000000000000', quantity: 1, servingUnit: 'cup' }
			]
		});
		expect(result.success).toBe(true);
	});
});

describe('recipe steps validation', () => {
	const base = {
		name: 'Shake',
		totalServings: 2,
		ingredients: [
			{ foodId: '00000000-0000-0000-0000-000000000000', quantity: 1, servingUnit: 'cup' }
		]
	};

	test('steps are optional', () => {
		expect(recipeCreateSchema.safeParse(base).success).toBe(true);
	});

	test('accepts text with an optional or null imageUrl and trims the text', () => {
		const result = recipeCreateSchema.safeParse({
			...base,
			steps: [
				{ text: '  Blend  ' },
				{ text: 'Pour', imageUrl: '/uploads/a.webp' },
				{ text: 'Serve', imageUrl: 'https://example.com/a.jpg' },
				{ text: 'Enjoy', imageUrl: null }
			]
		});
		expect(result.success).toBe(true);
		expect(result.data?.steps?.[0].text).toBe('Blend');
	});

	test.each([
		['blank text', [{ text: '   ' }]],
		['empty text', [{ text: '' }]],
		['missing text', [{ imageUrl: '/uploads/a.webp' }]],
		['over-long text', [{ text: 'x'.repeat(2001) }]],
		['a protocol-relative image', [{ text: 'a', imageUrl: '//evil.example/a.jpg' }]],
		['a data: image', [{ text: 'a', imageUrl: 'data:image/png;base64,AAAA' }]],
		['more than 50 steps', Array.from({ length: 51 }, () => ({ text: 'a' }))]
	])('rejects %s', (_name, steps) => {
		expect(recipeCreateSchema.safeParse({ ...base, steps }).success).toBe(false);
	});

	test('accepts exactly 50 steps of 2000 characters', () => {
		const steps = Array.from({ length: 50 }, () => ({ text: 'x'.repeat(2000) }));
		expect(recipeCreateSchema.safeParse({ ...base, steps }).success).toBe(true);
	});

	test('an update may carry only steps, including an empty list to clear them', () => {
		expect(recipeUpdateSchema.safeParse({ steps: [{ text: 'a' }] }).success).toBe(true);
		const cleared = recipeUpdateSchema.safeParse({ steps: [] });
		expect(cleared.success).toBe(true);
		expect(cleared.data?.steps).toEqual([]);
		expect(recipeUpdateSchema.safeParse({}).data?.steps).toBeUndefined();
	});
});
