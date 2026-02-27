import { describe, expect, test } from 'bun:test';
import {
	gramsToCalories,
	gramsToPct,
	pctToGrams,
	clamp,
	rebalance,
	MIN_PCT,
	MAX_PCT,
	KCAL_PER_GRAM
} from '../../src/lib/utils/macro-calc';

describe('gramsToCalories', () => {
	test('calculates total calories from macro grams', () => {
		expect(gramsToCalories(50, 200, 70)).toBe(50 * 4 + 200 * 4 + 70 * 9);
	});

	test('returns 0 when all grams are zero', () => {
		expect(gramsToCalories(0, 0, 0)).toBe(0);
	});

	test('handles single macro', () => {
		expect(gramsToCalories(100, 0, 0)).toBe(400);
		expect(gramsToCalories(0, 100, 0)).toBe(400);
		expect(gramsToCalories(0, 0, 100)).toBe(900);
	});
});

describe('gramsToPct', () => {
	test('converts grams to percentage split', () => {
		const result = gramsToPct(100, 100, 0);
		expect(result.protein).toBe(50);
		expect(result.carbs).toBe(50);
		expect(result.fat).toBe(0);
	});

	test('returns default split when all grams are zero', () => {
		const result = gramsToPct(0, 0, 0);
		expect(result).toEqual({ protein: 34, carbs: 33, fat: 33 });
	});

	test('accounts for fat having 9 kcal/g', () => {
		const result = gramsToPct(0, 0, 100);
		expect(result).toEqual({ protein: 0, carbs: 0, fat: 100 });
	});

	test('percentages are rounded', () => {
		const result = gramsToPct(33, 33, 33);
		const total = result.protein + result.carbs + result.fat;
		expect(total).toBeGreaterThanOrEqual(99);
		expect(total).toBeLessThanOrEqual(101);
	});

	test('typical balanced diet split', () => {
		const result = gramsToPct(150, 250, 67);
		const totalCal = 150 * 4 + 250 * 4 + 67 * 9;
		expect(result.protein).toBe(Math.round((150 * 4 / totalCal) * 100));
		expect(result.carbs).toBe(Math.round((250 * 4 / totalCal) * 100));
		expect(result.fat).toBe(Math.round((67 * 9 / totalCal) * 100));
	});
});

describe('pctToGrams', () => {
	test('converts percentage to grams for protein', () => {
		expect(pctToGrams(30, 'protein', 2000)).toBe(Math.round((0.3 * 2000) / 4));
	});

	test('converts percentage to grams for carbs', () => {
		expect(pctToGrams(50, 'carbs', 2000)).toBe(Math.round((0.5 * 2000) / 4));
	});

	test('converts percentage to grams for fat (9 kcal/g)', () => {
		expect(pctToGrams(30, 'fat', 2000)).toBe(Math.round((0.3 * 2000) / 9));
	});

	test('returns 0 grams for 0 percentage', () => {
		expect(pctToGrams(0, 'protein', 2000)).toBe(0);
	});

	test('returns 0 grams for 0 calories', () => {
		expect(pctToGrams(50, 'protein', 0)).toBe(0);
	});
});

describe('clamp', () => {
	test('returns MIN_PCT when value is below minimum', () => {
		expect(clamp(0)).toBe(MIN_PCT);
		expect(clamp(-10)).toBe(MIN_PCT);
		expect(clamp(4)).toBe(MIN_PCT);
	});

	test('returns MAX_PCT when value is above maximum', () => {
		expect(clamp(100)).toBe(MAX_PCT);
		expect(clamp(81)).toBe(MAX_PCT);
	});

	test('returns value when within range', () => {
		expect(clamp(5)).toBe(5);
		expect(clamp(50)).toBe(50);
		expect(clamp(80)).toBe(80);
	});

	test('boundary values', () => {
		expect(clamp(MIN_PCT)).toBe(MIN_PCT);
		expect(clamp(MAX_PCT)).toBe(MAX_PCT);
	});
});

describe('rebalance', () => {
	test('adjusts others proportionally when one slider changes', () => {
		const result = rebalance('protein', 40, { protein: 30, carbs: 40, fat: 30 });
		expect(result.protein).toBe(40);
		expect(result.carbs + result.fat).toBe(60);
		expect(result.protein + result.carbs + result.fat).toBe(100);
	});

	test('clamps the changed value', () => {
		const result = rebalance('protein', 95, { protein: 30, carbs: 40, fat: 30 });
		expect(result.protein).toBe(MAX_PCT);
	});

	test('maintains ratio of unchanged sliders', () => {
		const result = rebalance('protein', 50, { protein: 30, carbs: 40, fat: 30 });
		expect(result.protein).toBe(50);
		const carbsRatio = result.carbs / (result.carbs + result.fat);
		expect(carbsRatio).toBeCloseTo(40 / 70, 1);
	});

	test('all three percentages sum to 100', () => {
		const cases = [
			{ changed: 'protein' as const, val: 20, pcts: { protein: 33, carbs: 34, fat: 33 } },
			{ changed: 'carbs' as const, val: 60, pcts: { protein: 25, carbs: 50, fat: 25 } },
			{ changed: 'fat' as const, val: 10, pcts: { protein: 40, carbs: 40, fat: 20 } }
		];
		for (const c of cases) {
			const result = rebalance(c.changed, c.val, c.pcts);
			expect(result.protein + result.carbs + result.fat).toBe(100);
		}
	});

	test('handles edge case where other sum is zero', () => {
		const result = rebalance('protein', 40, { protein: 100, carbs: 0, fat: 0 });
		expect(result.protein).toBe(40);
		expect(result.carbs + result.fat).toBe(60);
	});

	test('respects MIN_PCT for other sliders', () => {
		const result = rebalance('protein', 80, { protein: 30, carbs: 40, fat: 30 });
		expect(result.protein).toBe(80);
		expect(result.carbs).toBeGreaterThanOrEqual(MIN_PCT);
		expect(result.fat).toBeGreaterThanOrEqual(MIN_PCT);
	});

	test('changing fat adjusts protein and carbs', () => {
		const result = rebalance('fat', 50, { protein: 25, carbs: 50, fat: 25 });
		expect(result.fat).toBe(50);
		expect(result.protein + result.carbs).toBe(50);
	});
});
