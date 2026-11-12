import { describe, expect, test } from 'vitest';
import { per100Scale, servingUnitValues } from '$lib/units';
import { fdcServingScale } from '$lib/server/fooddata-central';
import { offNutrientScale } from '$lib/server/food-enrichment/merge';

describe('per100Scale', () => {
	test.each([
		[100, 'g', 1],
		[0.25, 'kg', 2.5],
		[1, 'oz', 0.28349523125],
		[250, 'ml', 2.5],
		[33, 'cl', 3.3],
		[8, 'fl_oz', 2.365882365]
	] as const)('scales %s %s to %s', (size, unit, expected) => {
		expect(per100Scale(size, unit, ['mass', 'volume'])).toBeCloseTo(expected, 9);
	});

	test('only accepts the requested dimensions', () => {
		expect(per100Scale(250, 'ml', ['mass'])).toBeNull();
		expect(per100Scale(100, 'g', ['volume'])).toBeNull();
	});

	test.each(['cup', 'tbsp', 'tsp'] as const)('never scales %s', (unit) => {
		expect(per100Scale(1, unit, ['mass', 'volume'])).toBeNull();
	});

	test.each([0, -5, Number.NaN])('rejects a serving of %s', (size) => {
		expect(per100Scale(size, 'g', ['mass'])).toBeNull();
	});

	test('keeps the database rules: FoodData Central by weight, Open Food Facts by weight or volume', () => {
		for (const unit of servingUnitValues) {
			expect(fdcServingScale(150, unit)).toBe(per100Scale(150, unit, ['mass']));
			expect(offNutrientScale(150, unit)).toBe(per100Scale(150, unit, ['mass', 'volume']));
		}
		expect(fdcServingScale(250, 'ml')).toBeNull();
		expect(offNutrientScale(250, 'ml')).toBe(2.5);
	});
});
