import { describe, expect, test } from 'vitest';
import {
	cookedWeightServingSize,
	gramsToServings,
	caloriesPerHundredGrams
} from '../../src/lib/utils/recipe-yield';

describe('cookedWeightServingSize', () => {
	test('divides cooked weight by total servings', () => {
		expect(cookedWeightServingSize(800, 4)).toBe(200);
	});

	test('returns null when there is no cooked weight', () => {
		expect(cookedWeightServingSize(null, 4)).toBeNull();
		expect(cookedWeightServingSize(undefined, 4)).toBeNull();
		expect(cookedWeightServingSize(0, 4)).toBeNull();
	});

	test('returns null for a non-positive totalServings', () => {
		expect(cookedWeightServingSize(800, 0)).toBeNull();
		expect(cookedWeightServingSize(800, null)).toBeNull();
	});
});

describe('gramsToServings', () => {
	test('converts grams eaten into servings via cookedWeight / totalServings', () => {
		// 800g cooked / 4 servings = 200g per serving; eating 300g = 1.5 servings.
		expect(gramsToServings(300, 800, 4)).toBe(1.5);
	});

	test('returns null when the recipe has no cooked weight', () => {
		expect(gramsToServings(300, null, 4)).toBeNull();
	});

	test('returns null for non-positive grams', () => {
		expect(gramsToServings(0, 800, 4)).toBeNull();
	});
});

describe('caloriesPerHundredGrams', () => {
	test('scales whole-recipe calories down to a per-100g rate', () => {
		// 1600 kcal across an 800g dish = 200 kcal/100g.
		expect(caloriesPerHundredGrams(1600, 800)).toBe(200);
	});

	test('returns null without a cooked weight', () => {
		expect(caloriesPerHundredGrams(1600, null)).toBeNull();
		expect(caloriesPerHundredGrams(1600, 0)).toBeNull();
	});
});
