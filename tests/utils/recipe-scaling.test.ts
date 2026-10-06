import { describe, expect, it } from 'vitest';
import { excludeRecipe } from '$lib/utils/recipe-scaling';

describe('excludeRecipe', () => {
	const recipes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

	it('drops the recipe being edited', () => {
		expect(excludeRecipe(recipes, 'b')).toEqual([{ id: 'a' }, { id: 'c' }]);
	});

	it('keeps everything for a new recipe without an id', () => {
		expect(excludeRecipe(recipes, undefined)).toBe(recipes);
		expect(excludeRecipe(recipes, null)).toBe(recipes);
	});
});
