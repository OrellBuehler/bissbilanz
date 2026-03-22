import { describe, it, expect } from 'vitest';
import { computeCaloricLag } from '../caloric-lag';

function makeCalorieWeight(
	startDate: string,
	n: number,
	lag: number,
	baseCalories: number = 2000,
	baseWeight: number = 80
) {
	const calories: { date: string; value: number }[] = [];
	const weight: { date: string; value: number }[] = [];

	for (let i = 0; i < n + lag; i++) {
		const d = new Date(startDate + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() + i);
		const date = d.toISOString().slice(0, 10);
		const calValue = baseCalories + Math.sin(i) * 300;
		calories.push({ date, value: calValue });
	}

	for (let i = lag; i < n + lag; i++) {
		const d = new Date(startDate + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() + i);
		const date = d.toISOString().slice(0, 10);
		const weightValue = baseWeight + calories[i - lag].value / 10000;
		weight.push({ date, value: weightValue });
	}

	return { calories, weight };
}

describe('computeCaloricLag', () => {
	it('identifies lag=3 as best when calorie series is shifted by 3', () => {
		const { calories, weight } = makeCalorieWeight('2024-01-01', 20, 3);
		const result = computeCaloricLag(calories, weight, 5);
		expect(result.bestLag).toBe(3);
	});

	it('returns results array with one entry per lag offset', () => {
		const { calories, weight } = makeCalorieWeight('2024-01-01', 20, 2);
		const result = computeCaloricLag(calories, weight, 7);
		expect(result.results).toHaveLength(7);
		expect(result.results[0].lag).toBe(1);
		expect(result.results[6].lag).toBe(7);
	});

	it('handles missing dates in both series', () => {
		const calories = [
			{ date: '2024-01-01', value: 2000 },
			{ date: '2024-01-03', value: 2200 },
			{ date: '2024-01-05', value: 1800 },
			{ date: '2024-01-07', value: 2100 },
			{ date: '2024-01-09', value: 1900 },
			{ date: '2024-01-11', value: 2050 },
			{ date: '2024-01-13', value: 2300 },
			{ date: '2024-01-15', value: 1950 }
		];
		const weight = [
			{ date: '2024-01-04', value: 80.1 },
			{ date: '2024-01-06', value: 80.3 },
			{ date: '2024-01-08', value: 79.9 },
			{ date: '2024-01-10', value: 80.2 },
			{ date: '2024-01-12', value: 80.0 },
			{ date: '2024-01-14', value: 80.4 },
			{ date: '2024-01-16', value: 80.2 }
		];
		const result = computeCaloricLag(calories, weight, 3);
		expect(result.results).toHaveLength(3);
		expect(result.bestLag !== undefined).toBe(true);
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
		const calories = [
			{ date: '2024-01-01', value: null },
			{ date: '2024-01-02', value: 2000 },
			{ date: '2024-01-03', value: 2100 },
			{ date: '2024-01-04', value: 1900 },
			{ date: '2024-01-05', value: 2200 },
			{ date: '2024-01-06', value: 2050 },
			{ date: '2024-01-07', value: 1950 },
			{ date: '2024-01-08', value: 2150 }
		];
		const weight = [
			{ date: '2024-01-03', value: 80.0 },
			{ date: '2024-01-04', value: 80.1 },
			{ date: '2024-01-05', value: 80.2 },
			{ date: '2024-01-06', value: 80.0 },
			{ date: '2024-01-07', value: 80.3 },
			{ date: '2024-01-08', value: 80.1 },
			{ date: '2024-01-09', value: 80.2 }
		];
		const result = computeCaloricLag(calories, weight, 2);
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
		expect(result.results).toHaveLength(0);
	});

	it('handles non-contiguous dates (gaps) and still aligns correctly', () => {
		// calories every other day, weight every other day offset by lag=2
		const calories = [
			{ date: '2024-01-01', value: 2000 },
			{ date: '2024-01-03', value: 2100 },
			{ date: '2024-01-05', value: 1900 },
			{ date: '2024-01-07', value: 2200 },
			{ date: '2024-01-09', value: 2050 },
			{ date: '2024-01-11', value: 1950 },
			{ date: '2024-01-13', value: 2150 },
			{ date: '2024-01-15', value: 2300 }
		];
		const weight = [
			{ date: '2024-01-03', value: 80.0 },
			{ date: '2024-01-05', value: 80.2 },
			{ date: '2024-01-07', value: 79.9 },
			{ date: '2024-01-09', value: 80.3 },
			{ date: '2024-01-11', value: 80.1 },
			{ date: '2024-01-13', value: 80.0 },
			{ date: '2024-01-15', value: 80.4 },
			{ date: '2024-01-17', value: 80.2 }
		];
		const result = computeCaloricLag(calories, weight, 3);
		expect(result.results).toHaveLength(3);
		expect(result.bestLag !== undefined).toBe(true);
	});

	it('returns null correlation when very sparse overlap (2-3 dates per offset)', () => {
		const calories = [
			{ date: '2024-01-01', value: 2000 },
			{ date: '2024-01-02', value: 2100 },
			{ date: '2024-01-03', value: 1900 }
		];
		const weight = [
			{ date: '2024-01-03', value: 80.0 },
			{ date: '2024-01-04', value: 80.1 },
			{ date: '2024-01-05', value: 80.2 }
		];
		const result = computeCaloricLag(calories, weight, 2);
		for (const r of result.results) {
			expect(r.correlation).toBeNull();
		}
	});

	it('handles constant weight series (all values the same) — returns constant correlation', () => {
		const { calories } = makeCalorieWeight('2024-01-01', 20, 2);
		// All weight values identical
		const weight = calories.slice(2).map((c) => ({ date: c.date, value: 80.0 }));
		const result = computeCaloricLag(calories, weight, 3);
		for (const r of result.results) {
			if (r.correlation !== null) {
				expect(r.correlation.constantInput).toBe(true);
				expect(r.correlation.r).toBe(0);
			}
		}
	});
});
