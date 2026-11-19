import { describe, expect, test } from 'vitest';
import {
	cookedWeightServingSize,
	gramsToServings,
	caloriesPerHundredGrams,
	recipeServingAmount
} from '../../src/lib/utils/recipe-yield';
import type { ServingUnit } from '../../src/lib/units';

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

describe('recipeServingAmount', () => {
	const row = (quantity: number, servingUnit: ServingUnit) => ({ quantity, servingUnit });

	test('the cooked weight wins and is exact', () => {
		expect(recipeServingAmount(1400, 7, [row(100, 'g')])).toEqual({
			amount: 200,
			unit: 'g',
			estimated: false
		});
	});

	test('sums mixed grams and millilitres into an estimate in grams', () => {
		const feedback = [
			row(500, 'g'),
			row(500, 'g'),
			row(80, 'g'),
			row(27, 'g'),
			row(10, 'g'),
			row(9, 'g'),
			row(25, 'g'),
			row(215, 'ml')
		];
		const result = recipeServingAmount(null, 7, feedback);
		expect(result).toMatchObject({ unit: 'g', estimated: true });
		expect(result?.amount).toBeCloseTo(1366 / 7, 9);
	});

	test('answers in millilitres when every ingredient is a volume', () => {
		expect(recipeServingAmount(null, 5, [row(250, 'ml'), row(2, 'tbsp'), row(1, 'cup')])).toEqual({
			amount: 104,
			unit: 'ml',
			estimated: true
		});
	});

	test('converts non-base units to grams and millilitres first', () => {
		expect(recipeServingAmount(null, 4, [row(1.5, 'kg'), row(0.5, 'l')])).toEqual({
			amount: 500,
			unit: 'g',
			estimated: true
		});
		expect(recipeServingAmount(null, 2, [row(0.5, 'l')])).toEqual({
			amount: 250,
			unit: 'ml',
			estimated: true
		});
	});

	test('returns null without a cooked weight and without ingredients', () => {
		expect(recipeServingAmount(null, 4, [])).toBeNull();
		expect(recipeServingAmount(0, 4, null)).toBeNull();
		expect(recipeServingAmount(undefined, 4, undefined)).toBeNull();
	});

	test('returns null for a non-positive totalServings', () => {
		expect(recipeServingAmount(800, 0, [row(100, 'g')])).toBeNull();
		expect(recipeServingAmount(null, -2, [row(100, 'g')])).toBeNull();
		expect(recipeServingAmount(800, null, [row(100, 'g')])).toBeNull();
	});

	test('returns null when the ingredient amounts add up to nothing', () => {
		expect(recipeServingAmount(null, 4, [row(0, 'g')])).toBeNull();
	});
});
