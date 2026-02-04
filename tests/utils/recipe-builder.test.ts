import { describe, expect, test } from 'bun:test';
import { buildRecipePayload } from '../../src/lib/utils/recipe-builder';

describe('buildRecipePayload', () => {
	test('creates payload from form state', () => {
		const payload = buildRecipePayload({ name: 'Shake', totalServings: 2, ingredients: [] });
		expect(payload.name).toBe('Shake');
		expect(payload.totalServings).toBe(2);
	});

	test('includes ingredients', () => {
		const payload = buildRecipePayload({
			name: 'Bowl',
			totalServings: 1,
			ingredients: [{ foodId: 'abc', quantity: 2, servingUnit: 'g' }]
		});
		expect(payload.ingredients).toHaveLength(1);
	});
});
