import { describe, it, expect } from 'vitest';
import { extractNutrient, extractAllNutrients } from './nutrient-extract';

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
