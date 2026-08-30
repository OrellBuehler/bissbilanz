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

	test('all null novaGroup → no coverage, and a thin sample is not promoted to low', () => {
		const result = computeNOVAScore([
			{ calories: 500, novaGroup: null },
			{ calories: 300, novaGroup: null }
		]);
		expect(result.coveragePct).toBe(0);
		// Thin coverage downgrades a usable sample; it must not upgrade two
		// entries into something the confidence scale calls reportable.
		expect(result.confidence).toBe('insufficient');
		// sampleSize counts every logged entry — coveragePct is what says how
		// many of them carried a NOVA group.
		expect(result.sampleSize).toBe(2);
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

	test('ratio 15:1 → status elevated', () => {
		const result = computeOmegaRatio([{ date: '2024-01-01', omega3: 1, omega6: 15 }]);
		expect(result.ratio).toBe(15);
		expect(result.status).toBe('elevated');
	});

	test('a diet exactly at the IOM adequate intakes is optimal, not high', () => {
		// 17 g n-6 / 1.6 g n-3 (male AI) ≈ 10.6:1 — the app's own reference table.
		const result = computeOmegaRatio([{ date: '2024-01-01', omega3: 1.6, omega6: 17 }]);
		expect(result.status).toBe('optimal');
	});

	test('days below the coverage floor are excluded', () => {
		const result = computeOmegaRatio([
			{ date: '2024-01-01', omega3: 1, omega6: 4, coverage: 0.2 },
			{ date: '2024-01-02', omega3: 1, omega6: 8, coverage: 0.9 }
		]);
		expect(result.sampleSize).toBe(1);
		expect(result.ratio).toBe(8);
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

	test('ratio > 20 → status high', () => {
		const result = computeOmegaRatio([{ date: '2024-01-01', omega3: 0.5, omega6: 12 }]);
		expect(result.status).toBe('high');
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
			transFat: 0.1
		}));
		const result = computeDIIScore(days);
		expect(result.score).toBeLessThan(-result.neutralBand);
		expect(result.classification).toBe('anti-inflammatory');
	});

	test('follows the published centred-percentile algorithm and bounds each contribution', () => {
		// Fibre at the global mean + 1 SD: z = 1 → Φ = 0.8413 → centred 0.6827 → × −0.663.
		const atPlusOneSd = computeDIIScore(Array.from({ length: 7 }, () => ({ fiber: 18.8 + 4.9 })));
		expect(atPlusOneSd.contributors[0].impact).toBeCloseTo((2 * 0.841345 - 1) * -0.663, 3);

		// An implausible entry cannot move the score without bound: the
		// contribution saturates at |coefficient|.
		const extreme = computeDIIScore(Array.from({ length: 7 }, () => ({ fiber: 5000 })));
		expect(extreme.contributors[0].impact).toBeCloseTo(-0.663, 6);
		expect(extreme.coverageFraction).toBeCloseTo(0.663 / 13.152, 6);
	});

	test('alcohol is anti-inflammatory per Shivappa Table 2, caffeine is scored in grams', () => {
		const moderate = computeDIIScore(Array.from({ length: 7 }, () => ({ alcohol: 13.98 + 3.72 })));
		expect(moderate.contributors[0].impact).toBeLessThan(0);
		// 200 mg → 0.2 g, far below the 8.05 g table mean → percentile ≈ 0.12 → slightly positive.
		const coffee = computeDIIScore(Array.from({ length: 7 }, () => ({ caffeine: 200 })));
		expect(coffee.contributors[0].impact).toBeGreaterThan(0);
		expect(coffee.contributors[0].impact).toBeLessThan(0.11);
	});

	test('sodium is not a DII parameter', () => {
		const result = computeDIIScore(
			Array.from({ length: 7 }, () => ({ sodium: 7000 })) as Parameters<typeof computeDIIScore>[0]
		);
		expect(result.contributors).toHaveLength(0);
		expect(result.classification).toBe('neutral');
	});

	test('days below the coverage floor do not feed a nutrient mean', () => {
		const days = Array.from({ length: 10 }, (_, i) => ({
			fiber: i < 5 ? 40 : 5,
			coverage: { fiber: i < 5 ? 1 : 0.3 }
		}));
		const result = computeDIIScore(days);
		// Only the five well-covered 40 g days count → strongly anti-inflammatory.
		expect(result.contributors[0].impact).toBeLessThan(-0.6);
	});

	test('low fibre, high saturated fat, high trans fat → pro-inflammatory score', () => {
		const days = Array.from({ length: 14 }, () => ({
			fiber: 2,
			saturatedFat: 60,
			transFat: 8,
			alcohol: 0
		}));
		const result = computeDIIScore(days);
		expect(result.score).toBeGreaterThan(result.neutralBand);
		expect(result.classification).toBe('pro-inflammatory');
	});

	test('diet near global means → near zero score', () => {
		const days = Array.from({ length: 14 }, () => ({
			fiber: 18.8,
			omega3: 1.06,
			vitaminC: 118.2,
			saturatedFat: 28.6
		}));
		const result = computeDIIScore(days);
		expect(Math.abs(result.score)).toBeLessThan(1e-6);
		expect(result.classification).toBe('neutral');
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
			saturatedFat: 60
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

	test('alcohol adds its own thermic cost', () => {
		const dry = computeTEF([{ protein: 100, carbs: 200, fat: 70, calories: 2000 }]);
		const wet = computeTEF([{ protein: 100, carbs: 200, fat: 70, calories: 2280, alcohol: 40 }]);
		expect(wet.avgDailyTEF - dry.avgDailyTEF).toBeCloseTo(40 * 7 * 0.2, 6);
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
