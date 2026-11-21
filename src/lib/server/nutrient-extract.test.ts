import { describe, it, expect } from 'vitest';
import { dropPlaceholderZeros, extractNutrient, extractAllNutrients } from './nutrient-extract';

describe('nutrient-extract', () => {
	it('extractNutrient returns null for missing/NaN and rounds with conversion', () => {
		expect(extractNutrient({}, 'x_100g')).toBeNull();
		expect(extractNutrient({ x_100g: 'abc' }, 'x_100g')).toBeNull();
		expect(extractNutrient({}, undefined)).toBeNull();
		expect(extractNutrient({ x_100g: 1.234 }, 'x_100g')).toBe(1.23);
		expect(extractNutrient({ x_100g: 0.5 }, 'x_100g', 1000)).toBe(500);
		expect(extractNutrient({ x_100g: '2.5' }, 'x_100g')).toBe(2.5);
	});

	it('extractAllNutrients maps every ALL_NUTRIENTS key', async () => {
		const { ALL_NUTRIENT_KEYS } = await import('$lib/nutrients');
		const out = extractAllNutrients({ 'saturated-fat_100g': 5 });
		for (const k of ALL_NUTRIENT_KEYS) expect(k in out).toBe(true);
		expect(out.saturatedFat).toBe(5);
	});
});

describe('dropPlaceholderZeros', () => {
	it('keeps zeros a label declares and nulls the rest', () => {
		expect(
			dropPlaceholderZeros({
				sugar: 0,
				saturatedFat: 0,
				transFat: 0,
				cholesterol: 0,
				salt: 0,
				vitaminC: 0,
				iron: 0,
				starch: 0,
				addedSugars: 0,
				calcium: 120,
				caffeine: null
			})
		).toEqual({
			sugar: 0,
			saturatedFat: 0,
			transFat: 0,
			cholesterol: 0,
			salt: 0,
			vitaminC: null,
			iron: null,
			starch: null,
			addedSugars: null,
			calcium: 120,
			caffeine: null
		});
	});

	it('does not trust a zero sodium next to salt, or a zero salt next to sodium', () => {
		expect(dropPlaceholderZeros({ sodium: 0, salt: 1.9 })).toEqual({ sodium: null, salt: 1.9 });
		expect(dropPlaceholderZeros({ sodium: 400, salt: 0 })).toEqual({ sodium: 400, salt: null });
	});

	it('keeps a zero sodium and salt together and next to a tiny amount', () => {
		expect(dropPlaceholderZeros({ sodium: 0, salt: 0 })).toEqual({ sodium: 0, salt: 0 });
		expect(dropPlaceholderZeros({ sodium: 0, salt: 0.01 })).toEqual({ sodium: 0, salt: 0.01 });
		expect(dropPlaceholderZeros({ sodium: 0, salt: null })).toEqual({ sodium: 0, salt: null });
	});
});
