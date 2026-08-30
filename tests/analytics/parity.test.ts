import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { pearsonCorrelation } from '../../src/lib/analytics/correlation';
import { movingAverage, weightMovingAverage } from '../../src/lib/analytics/moving-average';
import { computeAdaptiveTDEE, detectPlateau, projectWeight } from '../../src/lib/analytics/tdee';
import { aggregateDailyNutrientTotals } from '../../src/lib/analytics/aggregation';
import { calculateMaintenance, smoothedWeightChange } from '../../src/lib/utils/maintenance';
import {
	normalCdf,
	studentTwoSidedP,
	welchTTest,
	benjaminiHochberg,
	fisherCI95
} from '../../src/lib/analytics/stats';
import {
	circularMeanMinutes,
	circularStdMinutes,
	eatingDayOf
} from '../../src/lib/analytics/local-time';
import { computeTEF, computeDIIScore } from '../../src/lib/analytics/food-quality';
import { extractMealTimingPatterns } from '../../src/lib/analytics/meal-timing';
import { computeCalorieFrontLoading } from '../../src/lib/analytics/calorie-patterns';
import { computeCaffeineSleepCutoff } from '../../src/lib/analytics/caffeine-sleep';
import { computeMealRegularity } from '../../src/lib/analytics/meal-regularity';
import { computeNOVAScore, computeOmegaRatio } from '../../src/lib/analytics/food-quality';
import { computeFoodDiversity } from '../../src/lib/analytics/food-diversity';
import { computeCalorieCycling } from '../../src/lib/analytics/calorie-patterns';
import { computeCaloricLag } from '../../src/lib/analytics/caloric-lag';
import { computeProteinDistribution } from '../../src/lib/analytics/protein-distribution';
import { computeSodiumWeightCorrelation } from '../../src/lib/analytics/sodium-weight';
import { computeWeekdayWeekendSplit } from '../../src/lib/analytics/weekday-weekend';
import { computeNutrientOutcomeCorrelations } from '../../src/lib/analytics/nutrient-correlation';
import { detectFoodSleepPatterns } from '../../src/lib/analytics/food-sleep';
import { getConfidenceLevel } from '../../src/lib/analytics/correlation';
import { localMinutesOfDay } from '../../src/lib/analytics/local-time';
import { nullDiv, nullSum } from '../../src/lib/analytics/aggregation';

/**
 * Cross-language golden-vector parity. The same frozen fixtures are asserted by
 * the Kotlin shared module (mobile/shared/.../AnalyticsParityTest.kt), so this
 * file and that one together fail CI if the server's TS analytics and the mobile
 * apps' Kotlin analytics ever diverge. See analytics-parity/README.md.
 */

type GoldenCase = { fn: string; name: string; input: Record<string, unknown>; expected: unknown };
type GoldenFile = { cases: GoldenCase[] };

const golden: GoldenFile = JSON.parse(
	readFileSync(resolve(__dirname, '../../analytics-parity/fixtures/golden-vectors.json'), 'utf-8')
);

function runFn(fn: string, input: any): unknown {
	switch (fn) {
		case 'pearsonCorrelation':
			return pearsonCorrelation(input.x, input.y);
		case 'movingAverage':
			return movingAverage(input.series, input.windowSize);
		case 'weightMovingAverage':
			return weightMovingAverage(input.entries, input.windowDays);
		case 'computeAdaptiveTDEE':
			return computeAdaptiveTDEE(input.weightSeries, input.calorieSeries, input.windowDays);
		case 'detectPlateau':
			return detectPlateau(input.weightSeries, input.calorieSeries, input.estimatedTDEE);
		case 'projectWeight':
			return projectWeight(input.weightSeries, input.weeklyRate, input.rateConfidence);
		case 'calculateMaintenance':
			return calculateMaintenance(input);
		case 'smoothedWeightChange':
			return smoothedWeightChange(input.weights, input.days);
		case 'normalCdf':
			return normalCdf(input.z);
		case 'studentTwoSidedP':
			return studentTwoSidedP(input.t, input.df);
		case 'welchTTest':
			return welchTTest(input.a, input.b);
		case 'benjaminiHochberg':
			return benjaminiHochberg(input.pValues);
		case 'fisherCI95':
			return fisherCI95(input.r, input.n);
		case 'circularMeanMinutes':
			return circularMeanMinutes(input.values);
		case 'circularStdMinutes':
			return circularStdMinutes(input.values);
		case 'eatingDayOf':
			return eatingDayOf(input.isoString, input.timeZone);
		case 'aggregateDailyNutrientTotals':
			return aggregateDailyNutrientTotals(input.entries, input.foods, input.recipes);
		case 'computeTEF':
			return computeTEF(input.dailyNutrients);
		case 'computeDIIScore':
			return computeDIIScore(input.dailyNutrients);
		case 'extractMealTimingPatterns':
			return extractMealTimingPatterns(input.entries, input.timeZone);
		case 'computeCalorieFrontLoading':
			return computeCalorieFrontLoading(input.entries, input.timeZone, input.cutoffHour);
		case 'computeCaffeineSleepCutoff':
			return computeCaffeineSleepCutoff(input.caffeineEntries, input.sleepData, input.timeZone);
		case 'computeMealRegularity':
			return computeMealRegularity(input.entries, input.timeZone);
		case 'computeNOVAScore':
			return computeNOVAScore(input.entries);
		case 'computeOmegaRatio':
			return computeOmegaRatio(input.dailyNutrients);
		case 'computeFoodDiversity':
			return computeFoodDiversity(input.entries);
		case 'computeCalorieCycling':
			return computeCalorieCycling(input.dailyNutrients);
		case 'computeCaloricLag':
			return computeCaloricLag(input.dailyCalories, input.dailyWeight, input.maxLag);
		case 'computeProteinDistribution':
			return computeProteinDistribution(input.entries, input.threshold);
		case 'computeSodiumWeightCorrelation':
			return computeSodiumWeightCorrelation(input.dailyNutrients, input.weightSeries);
		case 'computeWeekdayWeekendSplit':
			return computeWeekdayWeekendSplit(input.dailyNutrients);
		case 'computeNutrientOutcomeCorrelations':
			return computeNutrientOutcomeCorrelations(
				input.dailyNutrients,
				input.outcomes,
				input.lagDays
			);
		case 'detectFoodSleepPatterns':
			return detectFoodSleepPatterns(input.eveningFoods, input.sleepData, input.minOccurrences);
		case 'getConfidenceLevel':
			return getConfidenceLevel(input.sampleSize);
		case 'localMinutesOfDay':
			return localMinutesOfDay(input.isoString, input.timeZone);
		case 'nullDiv':
			return nullDiv(input.a, input.b);
		case 'nullSum':
			return nullSum(input.values);
		default:
			throw new Error(`Unknown fn in fixtures: ${fn}`);
	}
}

// Tolerance rule shared verbatim with the Kotlin harness: pValue is an absolute
// 1e-7 (it flows through an iterative beta approximation); every other number is
// a relative 1e-9 scaled by magnitude. Non-numbers must match exactly.
function numbersClose(actual: number, expected: number, key: string): boolean {
	if (Number.isNaN(actual) && Number.isNaN(expected)) return true;
	const tol = key === 'pValue' ? 1e-7 : 1e-9 * Math.max(1, Math.abs(expected));
	return Math.abs(actual - expected) <= tol;
}

function assertMatches(actual: any, expected: any, path: string, key = ''): void {
	if (expected === null || expected === undefined) {
		expect(actual ?? null, `${path} should be null`).toBe(null);
		return;
	}
	if (typeof expected === 'number') {
		expect(typeof actual, `${path} type`).toBe('number');
		expect(
			numbersClose(actual, expected, key),
			`${path}: expected ${expected}, got ${actual}`
		).toBe(true);
		return;
	}
	if (Array.isArray(expected)) {
		expect(Array.isArray(actual), `${path} should be array`).toBe(true);
		expect(actual.length, `${path} length`).toBe(expected.length);
		expected.forEach((v, i) => assertMatches(actual[i], v, `${path}[${i}]`, key));
		return;
	}
	if (typeof expected === 'object') {
		for (const k of Object.keys(expected)) {
			assertMatches(actual?.[k], expected[k], `${path}.${k}`, k);
		}
		return;
	}
	expect(actual, `${path}`).toBe(expected); // string / boolean
}

describe('analytics golden-vector parity (TypeScript)', () => {
	it('has cases to check', () => {
		expect(golden.cases.length).toBeGreaterThan(0);
	});

	for (const c of golden.cases) {
		it(`${c.fn}/${c.name}`, () => {
			const actual = runFn(c.fn, c.input);
			assertMatches(actual, c.expected, `${c.fn}/${c.name}`);
		});
	}
});
