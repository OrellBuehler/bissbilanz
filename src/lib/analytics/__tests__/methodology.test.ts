import { describe, it, expect } from 'vitest';
import { normalCdf, welchTTest, benjaminiHochberg, fisherCI95, studentTwoSidedP } from '../stats';
import { circularMeanMinutes, circularStdMinutes, eatingDayOf } from '../local-time';
import { extractMealTimingPatterns } from '../meal-timing';
import { computeMealRegularity } from '../meal-regularity';
import { computeCalorieFrontLoading } from '../calorie-patterns';
import { computeNOVAScore } from '../food-quality';
import { computeNutrientOutcomeCorrelations } from '../nutrient-correlation';
import { computeWeekdayWeekendSplit } from '../weekday-weekend';
import { computeSodiumWeightCorrelation } from '../sodium-weight';
import { aggregateDailyNutrientTotals } from '../aggregation';
import { aggregateEntriesByDay } from '../daily-coverage';
import { assessAdequacy } from '../nutrient-reference';
import { RDA_VALUES } from '../rda';
import { pearsonCorrelation } from '../correlation';

describe('stats', () => {
	it('normalCdf matches tabulated values', () => {
		expect(normalCdf(0)).toBeCloseTo(0.5, 7);
		expect(normalCdf(1)).toBeCloseTo(0.841345, 5);
		expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
		expect(normalCdf(3)).toBeCloseTo(0.99865, 5);
	});

	it('studentTwoSidedP matches known values', () => {
		expect(studentTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 3);
		expect(studentTwoSidedP(0, 10)).toBeCloseTo(1, 6);
	});

	it('welchTTest separates clearly different samples and not identical ones', () => {
		const a = [8, 8.2, 7.9, 8.1, 8.3, 7.8];
		const b = [5, 5.2, 4.9, 5.1, 5.3, 4.8];
		expect(welchTTest(a, b).pValue).toBeLessThan(0.001);
		expect(welchTTest(a, a).pValue).toBe(1);
		expect(welchTTest([1], [2, 3]).pValue).toBe(1);
	});

	it('benjaminiHochberg adjusts in the original order and is monotone', () => {
		const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.5]);
		expect(q[0]).toBeCloseTo(0.04, 9);
		expect(q[1]).toBeCloseTo((0.04 * 4) / 3, 9);
		expect(q[2]).toBeCloseTo((0.04 * 4) / 3, 9);
		expect(q[3]).toBeCloseTo(0.5, 9);
		expect(benjaminiHochberg([])).toEqual([]);
	});

	it('fisherCI95 brackets r and widens with small n', () => {
		const [lo, hi] = fisherCI95(0.5, 30);
		expect(lo).toBeLessThan(0.5);
		expect(hi).toBeGreaterThan(0.5);
		expect(hi - lo).toBeCloseTo(0.559, 2);
		const [lo8, hi8] = fisherCI95(0.5, 8);
		expect(hi8 - lo8).toBeGreaterThan(hi - lo);
		expect(fisherCI95(0.5, 3)).toEqual([-1, 1]);
	});

	it('pearsonCorrelation carries a confidence interval', () => {
		const x = Array.from({ length: 20 }, (_, i) => i);
		const r = pearsonCorrelation(
			x,
			x.map((v) => v + Math.sin(v) * 3)
		);
		expect(r.ciLow).toBeLessThan(r.r);
		expect(r.ciHigh).toBeGreaterThan(r.r);
	});
});

describe('circular time', () => {
	it('averages 23:00 and 01:00 to midnight, not noon', () => {
		expect(circularMeanMinutes([23 * 60, 1 * 60])).toBeCloseTo(0, 6);
		expect(circularStdMinutes([23 * 60, 1 * 60])).toBeCloseTo(60, 0);
	});

	it('agrees with the linear mean and SD for tightly clustered times', () => {
		const times = [480, 490, 470, 485];
		expect(circularMeanMinutes(times)).toBeCloseTo(481.25, 2);
		const m = 481.25;
		const linearSd = Math.sqrt(times.reduce((s, v) => s + (v - m) ** 2, 0) / times.length);
		expect(circularStdMinutes(times)).toBeCloseTo(linearSd, 1);
	});

	it('assigns a 00:30 snack to the previous eating day', () => {
		const p = eatingDayOf('2024-03-10T00:30:00Z', 'UTC')!;
		expect(p.date).toBe('2024-03-09');
		expect(p.minutes).toBe(20 * 60 + 30);
		expect(p.clockMinutes).toBe(30);
		const b = eatingDayOf('2024-03-10T08:00:00Z', 'UTC')!;
		expect(b.date).toBe('2024-03-10');
		expect(b.minutes).toBe(4 * 60);
	});
});

describe('eating window across midnight', () => {
	it('extends the evening window instead of shrinking the next day', () => {
		const entries = [
			{ date: '2024-03-09', eatenAt: '2024-03-09T08:00:00Z', calories: 400 },
			{ date: '2024-03-09', eatenAt: '2024-03-09T20:00:00Z', calories: 700 },
			{ date: '2024-03-10', eatenAt: '2024-03-10T00:30:00Z', calories: 150 },
			{ date: '2024-03-10', eatenAt: '2024-03-10T08:00:00Z', calories: 400 },
			{ date: '2024-03-10', eatenAt: '2024-03-10T19:00:00Z', calories: 700 }
		];
		const result = extractMealTimingPatterns(entries, 'UTC');
		expect(result.dailyWindows).toHaveLength(2);
		const [d1, d2] = result.dailyWindows;
		expect(d1.date).toBe('2024-03-09');
		expect(d1.firstMealTime).toBe('08:00');
		expect(d1.lastMealTime).toBe('00:30');
		expect(d1.windowMinutes).toBe(16 * 60 + 30);
		expect(d1.lateNightMeals).toBe(1);
		expect(d2.windowMinutes).toBe(11 * 60);
		expect(result.avgLastMealTime).toBe('21:45');
	});

	it('front-loading does not count a post-midnight snack as morning calories', () => {
		const entries = [
			{ date: '2024-03-10', eatenAt: '2024-03-10T01:00:00Z', calories: 500 },
			{ date: '2024-03-10', eatenAt: '2024-03-10T09:00:00Z', calories: 500 },
			{ date: '2024-03-10', eatenAt: '2024-03-10T19:00:00Z', calories: 500 }
		];
		const result = computeCalorieFrontLoading(entries, 'UTC');
		// The 01:00 snack belongs to the 9th; the 10th is 500 of 1000 before 14:00.
		const day = result.totalDays;
		expect(day).toBe(2);
		expect(result.avgMorningPct).toBeCloseTo((0 + 50) / 2, 6);
	});
});

describe('meal regularity across midnight', () => {
	it('does not treat a dinner at 23:50 and 00:10 as twelve hours apart', () => {
		const entries = [
			{ date: '2024-01-01', mealType: 'Dinner', eatenAt: '2024-01-01T23:50:00Z' },
			{ date: '2024-01-02', mealType: 'Dinner', eatenAt: '2024-01-03T00:10:00Z' },
			{ date: '2024-01-03', mealType: 'Dinner', eatenAt: '2024-01-03T23:55:00Z' },
			{ date: '2024-01-04', mealType: 'Dinner', eatenAt: '2024-01-05T00:05:00Z' }
		];
		const result = computeMealRegularity(entries, 'UTC');
		expect(result.meals[0].stddevMinutes).toBeLessThan(15);
		expect(result.meals[0].regularity).toBe('high');
		const avg = result.meals[0].avgMinute;
		expect(avg < 30 || avg > 1410).toBe(true);
	});
});

describe('NOVA over total calories', () => {
	it('reports the untagged share as unknown rather than excluding it', () => {
		const result = computeNOVAScore([
			{ calories: 200, novaGroup: 4 },
			{ calories: 800, novaGroup: null }
		]);
		expect(result.ultraProcessedPct).toBe(20);
		expect(result.unknownPct).toBe(80);
		expect(result.coveragePct).toBe(20);
	});
});

describe('nutrient screen', () => {
	const dates = Array.from({ length: 30 }, (_, i) => {
		const d = new Date('2024-01-01T00:00:00Z');
		d.setUTCDate(d.getUTCDate() + i);
		return d.toISOString().slice(0, 10);
	});

	it('needs at least seven pairs and reports the number of comparisons', () => {
		const two = computeNutrientOutcomeCorrelations(
			dates.slice(0, 2).map((date, i) => ({ date, nutrients: { iron: 10 + i } })),
			dates.slice(0, 2).map((date, i) => ({ date, value: i }))
		);
		expect(two).toEqual([]);

		const result = computeNutrientOutcomeCorrelations(
			dates.map((date, i) => ({
				date,
				nutrients: { strong: i * 3, noise: Math.sin(i * 7.3) * 5, flat: 2 }
			})),
			dates.map((date, i) => ({ date, value: i }))
		);
		expect(result.map((r) => r.nutrientKey)).toEqual(['strong']);
		expect(result[0].comparisons).toBe(3);
		expect(result[0].qValue).toBeLessThan(0.01);
	});
});

describe('weekday/weekend', () => {
	it('badges by the smaller group and tests the delta', () => {
		const days = Array.from({ length: 21 }, (_, i) => {
			const d = new Date(Date.UTC(2025, 0, 1) + i * 86400000);
			const dow = d.getUTCDay();
			const weekend = dow === 0 || dow === 6;
			return {
				date: d.toISOString().slice(0, 10),
				calories: (weekend ? 2600 : 2000) + (i % 3) * 20,
				protein: 100,
				carbs: 200,
				fat: 70,
				fiber: 25
			};
		});
		const result = computeWeekdayWeekendSplit(days);
		expect(result.weekend.days).toBe(6);
		expect(result.confidence).toBe('insufficient');
		expect(result.pValue).not.toBeNull();
		expect(result.pValue!).toBeLessThan(0.001);
	});
});

describe('coverage', () => {
	it('records the calorie share that carried each extended nutrient', () => {
		const foods = [
			{
				id: 'labelled',
				servingSize: 100,
				calories: 400,
				protein: 10,
				carbs: 40,
				fat: 20,
				fiber: 2,
				sodium: 800
			},
			{ id: 'home', servingSize: 100, calories: 600, protein: 30, carbs: 50, fat: 25, fiber: 8 }
		];
		const totals = aggregateDailyNutrientTotals(
			[
				{ date: '2024-01-01', mealType: 'Lunch', servings: 1, foodId: 'labelled' },
				{ date: '2024-01-01', mealType: 'Dinner', servings: 1, foodId: 'home' }
			],
			foods,
			[]
		);
		expect(totals[0].sodium).toBe(800);
		expect(totals[0].sodiumCoverage).toBeCloseTo(0.4, 9);
		expect(totals[0].vitaminCCoverage).toBe(0);
	});

	it('aggregateEntriesByDay keeps nulls as nulls', () => {
		const days = aggregateEntriesByDay(
			[
				{ date: '2024-01-01', calories: 400, sodium: 800 },
				{ date: '2024-01-01', calories: 600, sodium: null },
				{ date: '2024-01-02', calories: 500, sodium: null }
			],
			['sodium'] as const
		);
		expect(days[0].values.sodium).toBe(800);
		expect(days[0].coverage.sodium).toBeCloseTo(0.4, 9);
		expect(days[1].values.sodium).toBeNull();
		expect(days[1].coverage.sodium).toBe(0);
	});

	it('sodium/weight ignores days under the coverage floor and averages the paired days', () => {
		const weights = Array.from({ length: 10 }, (_, i) => ({
			date: `2024-01-${String(i + 1).padStart(2, '0')}`,
			weightKg: 80 + (i % 2) * 0.3
		}));
		const sodium = weights.map((w, i) => ({
			date: w.date,
			sodium: i % 2 === 0 ? 3000 : 1500,
			coverage: i === 0 ? 0.1 : 1
		}));
		const result = computeSodiumWeightCorrelation(sodium, weights);
		// Day 1 dropped for coverage, day 10 has no next-day weight.
		expect(result.sampleSize).toBe(8);
		expect(result.avgSodium).toBeCloseTo((4 * 3000 + 4 * 1500) / 8, 6);
		expect(result.correlation.ciLow).not.toBeNull();
	});
});

describe('nutrient adequacy references', () => {
	const iron = RDA_VALUES.find((r) => r.nutrientKey === 'iron')!;
	const sodium = RDA_VALUES.find((r) => r.nutrientKey === 'sodium')!;
	const fiber = RDA_VALUES.find((r) => r.nutrientKey === 'fiber')!;
	const vitaminK = RDA_VALUES.find((r) => r.nutrientKey === 'vitaminK')!;

	it('uses the sex-specific EAR/RDA band instead of an averaged RDA', () => {
		expect(assessAdequacy(iron, 13, 'male', null).verdict).toBe('likely_adequate');
		expect(assessAdequacy(iron, 13, 'female', null).verdict).toBe('uncertain');
		expect(assessAdequacy(iron, 7, 'female', null).verdict).toBe('likely_inadequate');
		expect(assessAdequacy(iron, 13, null, null).verdict).toBe('depends_on_sex');
		expect(assessAdequacy(iron, 20, null, null).verdict).toBe('likely_adequate');
	});

	it('treats sodium as a ceiling, not a target', () => {
		expect(assessAdequacy(sodium, 1500, null, null).verdict).toBe('likely_adequate');
		expect(assessAdequacy(sodium, 3000, null, null).verdict).toBe('above_limit');
	});

	it('scales fiber to energy intake', () => {
		const a = assessAdequacy(fiber, 21, 'male', 1500);
		expect(a.target).toBeCloseTo(21, 9);
		expect(a.verdict).toBe('likely_adequate');
		expect(assessAdequacy(fiber, 21, 'male', null).verdict).toBe('no_conclusion');
	});

	it('cannot conclude inadequacy from an AI', () => {
		expect(assessAdequacy(vitaminK, 60, 'male', null).verdict).toBe('no_conclusion');
		expect(assessAdequacy(vitaminK, 120, 'male', null).verdict).toBe('likely_adequate');
	});
});
