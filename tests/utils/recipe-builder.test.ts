import { describe, expect, test } from 'vitest';
import { buildRecipePayload } from '../../src/lib/utils/recipe-builder';

describe('buildRecipePayload', () => {
	test('creates payload from form state', () => {
		const payload = buildRecipePayload({
			name: 'Shake',
			totalServings: 2,
			cookedWeight: null,
			ingredients: []
		});
		expect(payload.name).toBe('Shake');
		expect(payload.totalServings).toBe(2);
		expect(payload.cookedWeight).toBeNull();
	});

	test('includes ingredients', () => {
		const payload = buildRecipePayload({
			name: 'Bowl',
			totalServings: 1,
			cookedWeight: null,
			ingredients: [{ foodId: 'abc', quantity: 2, servingUnit: 'g' }]
		});
		expect(payload.ingredients).toHaveLength(1);
	});

	test('carries a cooked weight through', () => {
		const payload = buildRecipePayload({
			name: 'Stew',
			totalServings: 4,
			cookedWeight: 850,
			ingredients: [{ foodId: 'abc', quantity: 2, servingUnit: 'g' }]
		});
		expect(payload.cookedWeight).toBe(850);
	});
});
