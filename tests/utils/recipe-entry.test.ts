import { describe, expect, test } from 'bun:test';
import { toRecipeEntryPayload } from '../../src/lib/utils/recipe-entry';

describe('toRecipeEntryPayload', () => {
	test('maps recipe entry to payload', () => {
		const payload = toRecipeEntryPayload({ recipeId: 'r1', mealType: 'Dinner', servings: 2 });
		expect(payload.recipeId).toBe('r1');
		expect(payload.mealType).toBe('Dinner');
		expect(payload.servings).toBe(2);
	});
});
