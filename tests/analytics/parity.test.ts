import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { pearsonCorrelation } from '../../src/lib/analytics/correlation';
import { movingAverage, weightMovingAverage } from '../../src/lib/analytics/moving-average';
import { computeAdaptiveTDEE, detectPlateau, projectWeight } from '../../src/lib/analytics/tdee';
import { aggregateDailyNutrientTotals } from '../../src/lib/analytics/aggregation';
import { calculateMaintenance } from '../../src/lib/utils/maintenance';
import { computeTEF } from '../../src/lib/analytics/food-quality';
import { extractMealTimingPatterns } from '../../src/lib/analytics/meal-timing';
import { computeCalorieFrontLoading } from '../../src/lib/analytics/calorie-patterns';
import { computeCaffeineSleepCutoff } from '../../src/lib/analytics/caffeine-sleep';
import { computeMealRegularity } from '../../src/lib/analytics/meal-regularity';

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
			return detectPlateau(
				input.weightSeries,
				input.calorieSeries,
				input.estimatedTDEE,
				input.sodiumAvg
			);
		case 'projectWeight':
			return projectWeight(input.weightSeries, input.weeklyRate);
		case 'calculateMaintenance':
			return calculateMaintenance(input);
		case 'aggregateDailyNutrientTotals':
			return aggregateDailyNutrientTotals(input.entries, input.foods, input.recipes);
		case 'computeTEF':
			return computeTEF(input.dailyNutrients);
		case 'extractMealTimingPatterns':
			return extractMealTimingPatterns(input.entries, input.timeZone);
		case 'computeCalorieFrontLoading':
			return computeCalorieFrontLoading(input.entries, input.timeZone, input.cutoffHour);
		case 'computeCaffeineSleepCutoff':
			return computeCaffeineSleepCutoff(input.caffeineEntries, input.sleepData, input.timeZone);
		case 'computeMealRegularity':
			return computeMealRegularity(input.entries, input.timeZone);
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
