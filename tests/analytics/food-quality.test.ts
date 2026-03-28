import { describe, expect, test } from 'vitest';
import {
	computeNOVAScore,
	computeOmegaRatio,
	computeDIIScore,
	computeTEF
} from '../../src/lib/analytics/food-quality';

describe('computeNOVAScore', () => {
	test('all group 4 → ultraProcessedPct = 100', () => {
		const result = computeNOVAScore([
			{ calories: 300, novaGroup: 4 },
			{ calories: 200, novaGroup: 4 }
		]);
		expect(result.ultraProcessedPct).toBe(100);
		expect(result.coveragePct).toBe(100);
	});

	test('mixed groups → correct percentages', () => {
		const result = computeNOVAScore([
			{ calories: 400, novaGroup: 1 },
			{ calories: 400, novaGroup: 4 }
		]);
		expect(result.ultraProcessedPct).toBe(50);
		expect(result.byGroup).toHaveLength(2);
		const g1 = result.byGroup.find((b) => b.group === 1);
		const g4 = result.byGroup.find((b) => b.group === 4);
		expect(g1?.pct).toBe(50);
		expect(g4?.pct).toBe(50);
	});

	test('all null novaGroup → coveragePct = 0, confidence = low', () => {
		const result = computeNOVAScore([
			{ calories: 500, novaGroup: null },
			{ calories: 300, novaGroup: null }
		]);
		expect(result.coveragePct).toBe(0);
		expect(result.confidence).toBe('low');
		expect(result.sampleSize).toBe(0);
	});

	test('50% coverage with sufficient samples → confidence not forced to low by coverage', () => {
		const withNova = Array.from({ length: 30 }, () => ({
			calories: 100,
			novaGroup: 2 as number | null
		}));
		const withoutNova = Array.from({ length: 30 }, () => ({
			calories: 100,
			novaGroup: null as number | null
		}));
		const result = computeNOVAScore([...withNova, ...withoutNova]);
		expect(result.coveragePct).toBe(50);
		expect(result.confidence).toBe('high');
	});
});

describe('computeOmegaRatio', () => {
	test('ratio 2:1 → status optimal', () => {
		const result = computeOmegaRatio([{ date: '2024-01-01', omega3: 2, omega6: 4 }]);
		expect(result.ratio).toBe(2);
		expect(result.status).toBe('optimal');
	});

	test('ratio 15:1 → status high', () => {
		const result = computeOmegaRatio([{ date: '2024-01-01', omega3: 1, omega6: 15 }]);
		expect(result.ratio).toBe(15);
		expect(result.status).toBe('high');
	});

	test('no data → ratio null', () => {
		const result = computeOmegaRatio([]);
		expect(result.ratio).toBeNull();
		expect(result.sampleSize).toBe(0);
		expect(result.confidence).toBe('insufficient');
	});

	test('days with zero omega3 or omega6 are excluded', () => {
		const result = computeOmegaRatio([
			{ date: '2024-01-01', omega3: 0, omega6: 5 },
			{ date: '2024-01-02', omega3: 1, omega6: 4 }
		]);
		expect(result.sampleSize).toBe(1);
		expect(result.ratio).toBe(4);
	});

	test('ratio > 20 → status critical', () => {
		const result = computeOmegaRatio([{ date: '2024-01-01', omega3: 0.5, omega6: 12 }]);
		expect(result.status).toBe('critical');
	});
});

describe('computeDIIScore', () => {
	test('high fiber, high omega3, high vitC diet → anti-inflammatory score', () => {
		const days = Array.from({ length: 14 }, () => ({
			fiber: 40,
			omega3: 5,
			vitaminC: 500,
			vitaminD: 20,
			vitaminE: 20,
			saturatedFat: 5,
			transFat: 0.1,
			sodium: 500
		}));
		const result = computeDIIScore(days);
		expect(result.score).toBeLessThan(-1.0);
		expect(result.classification).toBe('anti-inflammatory');
	});

	test('high saturated fat, high sodium, high trans fat → pro-inflammatory score', () => {
		const days = Array.from({ length: 14 }, () => ({
			fiber: 2,
			saturatedFat: 60,
			transFat: 8,
			sodium: 7000,
			alcohol: 40
		}));
		const result = computeDIIScore(days);
		expect(result.score).toBeGreaterThan(1.0);
		expect(result.classification).toBe('pro-inflammatory');
	});

	test('diet near global means → near zero score', () => {
		const days = Array.from({ length: 14 }, () => ({
			fiber: 18.8,
			omega3: 1.3,
			vitaminC: 108,
			saturatedFat: 28.6,
			sodium: 3446
		}));
		const result = computeDIIScore(days);
		expect(Math.abs(result.score)).toBeLessThan(0.5);
	});

	test('empty input → insufficient confidence', () => {
		const result = computeDIIScore([]);
		expect(result.confidence).toBe('insufficient');
		expect(result.sampleSize).toBe(0);
	});

	test('contributors sorted by absolute impact', () => {
		const days = Array.from({ length: 14 }, () => ({
			fiber: 40,
			omega3: 5,
			sodium: 7000
		}));
		const result = computeDIIScore(days);
		for (let i = 0; i < result.contributors.length - 1; i++) {
			expect(Math.abs(result.contributors[i].impact)).toBeGreaterThanOrEqual(
				Math.abs(result.contributors[i + 1].impact)
			);
		}
	});
});

describe('computeTEF', () => {
	test('150g protein, 200g carbs, 70g fat → TEF ≈ 232.9', () => {
		const result = computeTEF([{ protein: 150, carbs: 200, fat: 70, calories: 2230 }]);
		const expected = 150 * 4 * 0.25 + 200 * 4 * 0.08 + 70 * 9 * 0.03;
		expect(result.avgDailyTEF).toBeCloseTo(expected, 5);
	});

	test('high protein diet has higher TEF% than high fat diet', () => {
		const highProtein = computeTEF([{ protein: 200, carbs: 100, fat: 30, calories: 1510 }]);
		const highFat = computeTEF([{ protein: 30, carbs: 100, fat: 150, calories: 1870 }]);
		expect(highProtein.avgTEFPercent).toBeGreaterThan(highFat.avgTEFPercent);
	});

	test('empty input → zero values', () => {
		const result = computeTEF([]);
		expect(result.avgDailyTEF).toBe(0);
		expect(result.avgTEFPercent).toBe(0);
		expect(result.confidence).toBe('insufficient');
	});

	test('sampleSize reflects number of days', () => {
		const days = [
			{ protein: 100, carbs: 200, fat: 60, calories: 1740 },
			{ protein: 120, carbs: 180, fat: 55, calories: 1695 }
		];
		const result = computeTEF(days);
		expect(result.sampleSize).toBe(2);
	});
});
