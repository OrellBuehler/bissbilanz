import { describe, it, expect } from 'vitest';
import { computeCaloricLag } from '../caloric-lag';

/** Deterministic pseudo-random intake so neighbouring lags are not autocorrelated. */
function lcg(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(1664525, s) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

function isoDay(startDate: string, i: number): string {
	const d = new Date(startDate + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + i);
	return d.toISOString().slice(0, 10);
}

/**
 * Weight moves day over day in proportion to intake `lag` days earlier, so the
 * signal lives in the weight *difference*, which is what the analytic tests.
 */
function makeCalorieWeight(
	startDate: string,
	n: number,
	lag: number,
	baseCalories: number = 2000,
	baseWeight: number = 80
) {
	const rand = lcg(42);
	const calories: { date: string; value: number }[] = [];
	const weight: { date: string; value: number }[] = [];

	for (let i = 0; i < n + lag; i++) {
		calories.push({ date: isoDay(startDate, i), value: baseCalories + (rand() - 0.5) * 800 });
	}

	let w = baseWeight;
	for (let i = lag; i < n + lag; i++) {
		w += (calories[i - lag].value - baseCalories) / 20000;
		weight.push({ date: isoDay(startDate, i), value: w });
	}

	return { calories, weight };
}

describe('computeCaloricLag', () => {
	it('identifies lag=3 as best when weight change follows intake by 3 days', () => {
		const { calories, weight } = makeCalorieWeight('2024-01-01', 30, 3);
		const result = computeCaloricLag(calories, weight, 5);
		expect(result.bestLag).toBe(3);
		const best = result.results.find((r) => r.lag === 3)!;
		expect(best.correlation!.r).toBeGreaterThan(0.99);
		expect(best.qValue).not.toBeNull();
		expect(best.qValue!).toBeLessThan(0.05);
	});

	it('reports how many lags were testable', () => {
		const { calories, weight } = makeCalorieWeight('2024-01-01', 30, 2);
		const result = computeCaloricLag(calories, weight, 7);
		expect(result.comparisons).toBe(7);
	});

	it('returns no best lag when nothing survives FDR control', () => {
		// Weight is an unrelated random walk.
		const rand = lcg(7);
		const calories = Array.from({ length: 40 }, (_, i) => ({
			date: isoDay('2024-01-01', i),
			value: 2000 + (rand() - 0.5) * 800
		}));
		let w = 80;
		const weight = calories.map((c) => {
			w += (rand() - 0.5) * 0.4;
			return { date: c.date, value: w };
		});
		const result = computeCaloricLag(calories, weight, 7);
		expect(result.bestLag).toBeNull();
		for (const r of result.results) {
			expect(r.qValue === null || r.qValue > 0.05).toBe(true);
		}
	});

	it('returns results array with one entry per lag offset', () => {
		const { calories, weight } = makeCalorieWeight('2024-01-01', 20, 2);
		const result = computeCaloricLag(calories, weight, 7);
		expect(result.results).toHaveLength(7);
		expect(result.results[0].lag).toBe(1);
		expect(result.results[6].lag).toBe(7);
	});

	it('needs consecutive weights to form a day-over-day change', () => {
		// Weights every other day never form a consecutive pair → nothing testable.
		const calories = Array.from({ length: 16 }, (_, i) => ({
			date: isoDay('2024-01-01', i),
			value: 2000 + i
		}));
		const weight = Array.from({ length: 8 }, (_, i) => ({
			date: isoDay('2024-01-01', i * 2),
			value: 80 + i * 0.1
		}));
		const result = computeCaloricLag(calories, weight, 3);
		expect(result.comparisons).toBe(0);
		expect(result.bestLag).toBeNull();
		for (const r of result.results) expect(r.correlation).toBeNull();
	});

	it('returns null correlation when too few paired data points for a lag', () => {
		const calories = [
			{ date: '2024-01-01', value: 2000 },
			{ date: '2024-01-02', value: 2100 },
			{ date: '2024-01-03', value: 2200 }
		];
		const weight = [
			{ date: '2024-01-04', value: 80.0 },
			{ date: '2024-01-05', value: 80.1 }
		];
		const result = computeCaloricLag(calories, weight, 3);
		for (const r of result.results) {
			expect(r.correlation).toBeNull();
		}
	});

	it('returns bestLag=null when all offsets have too few data points', () => {
		const calories = [
			{ date: '2024-01-01', value: 2000 },
			{ date: '2024-01-02', value: 2100 }
		];
		const weight = [
			{ date: '2024-01-05', value: 80.0 },
			{ date: '2024-01-06', value: 80.1 }
		];
		const result = computeCaloricLag(calories, weight, 3);
		expect(result.bestLag).toBeNull();
	});

	it('handles null values in input series', () => {
		const { calories, weight } = makeCalorieWeight('2024-01-01', 20, 2);
		const withNulls = calories.map((c, i) => (i % 5 === 0 ? { ...c, value: null } : c));
		const result = computeCaloricLag(withNulls, weight, 2);
		expect(result.results).toHaveLength(2);
	});

	it('uses default maxLag of 7', () => {
		const { calories, weight } = makeCalorieWeight('2024-01-01', 25, 2);
		const result = computeCaloricLag(calories, weight);
		expect(result.results).toHaveLength(7);
	});

	it('returns empty results for maxLag=0', () => {
		const calories = [
			{ date: '2024-01-01', value: 2000 },
			{ date: '2024-01-02', value: 2500 }
		];
		const weight = [
			{ date: '2024-01-01', value: 80 },
			{ date: '2024-01-02', value: 80.1 }
		];
		const result = computeCaloricLag(calories, weight, 0);
		expect(result.bestLag).toBeNull();
		expect(result.comparisons).toBe(0);
		expect(result.results).toHaveLength(0);
	});

	it('handles constant weight series — every change is zero, constant input', () => {
		const { calories } = makeCalorieWeight('2024-01-01', 20, 2);
		const weight = calories.slice(2).map((c) => ({ date: c.date, value: 80.0 }));
		const result = computeCaloricLag(calories, weight, 3);
		expect(result.bestLag).toBeNull();
		for (const r of result.results) {
			if (r.correlation !== null) {
				expect(r.correlation.constantInput).toBe(true);
				expect(r.correlation.r).toBe(0);
			}
		}
	});
});
