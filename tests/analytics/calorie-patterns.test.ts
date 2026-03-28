import { describe, test, expect } from 'vitest';
import { computeCalorieFrontLoading, computeCalorieCycling } from '$lib/analytics/calorie-patterns';

describe('computeCalorieFrontLoading', () => {
	test('all morning eating gives high avgMorningPct', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T08:00:00+00:00', calories: 500 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T10:00:00+00:00', calories: 500 },
			{ date: '2024-01-02', eatenAt: '2024-01-02T09:00:00+00:00', calories: 600 },
			{ date: '2024-01-02', eatenAt: '2024-01-02T11:00:00+00:00', calories: 400 }
		];
		const result = computeCalorieFrontLoading(entries, 14);
		expect(result.avgMorningPct).toBe(100);
		expect(result.daysAbove50Pct).toBe(2);
	});

	test('all evening eating gives low avgMorningPct', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T18:00:00+00:00', calories: 800 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T20:00:00+00:00', calories: 700 }
		];
		const result = computeCalorieFrontLoading(entries, 14);
		expect(result.avgMorningPct).toBe(0);
		expect(result.daysAbove50Pct).toBe(0);
	});

	test('skips entries without eatenAt', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: null, calories: 800 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T09:00:00+00:00', calories: 500 }
		];
		const result = computeCalorieFrontLoading(entries, 14);
		expect(result.sampleSize).toBe(1);
		expect(result.avgMorningPct).toBe(100);
	});

	test('returns zero for empty input', () => {
		const result = computeCalorieFrontLoading([], 14);
		expect(result.avgMorningPct).toBe(0);
		expect(result.sampleSize).toBe(0);
		expect(result.confidence).toBe('insufficient');
	});
});

describe('computeCalorieCycling', () => {
	test('consistent 2000 kcal gives low CV and consistent pattern', () => {
		const days = Array.from({ length: 14 }, (_, i) => ({
			date: `2024-01-${String(i + 1).padStart(2, '0')}`,
			calories: 2000
		}));
		const result = computeCalorieCycling(days);
		expect(result.cv).toBe(0);
		expect(result.pattern).toBe('consistent');
		expect(result.stddev).toBe(0);
	});

	test('alternating 1500/2500 gives high variance', () => {
		const days = Array.from({ length: 20 }, (_, i) => ({
			date: `2024-01-${String(i + 1).padStart(2, '0')}`,
			calories: i % 2 === 0 ? 1500 : 2500
		}));
		const result = computeCalorieCycling(days);
		expect(result.cv).toBeGreaterThan(15);
		expect(result.mean).toBe(2000);
	});

	test('pattern thresholds', () => {
		const makeUniform = (cal: number, count = 10) =>
			Array.from({ length: count }, (_, i) => ({
				date: `2024-01-${String(i + 1).padStart(2, '0')}`,
				calories: cal
			}));

		expect(computeCalorieCycling(makeUniform(2000)).pattern).toBe('consistent');

		const moderate = Array.from({ length: 10 }, (_, i) => ({
			date: `2024-01-${String(i + 1).padStart(2, '0')}`,
			calories: 2000 + (i % 2 === 0 ? 250 : -250)
		}));
		const modResult = computeCalorieCycling(moderate);
		expect(modResult.cv).toBeGreaterThan(0);
		expect(['moderate', 'consistent']).toContain(modResult.pattern);
	});

	test('highDays and lowDays counts', () => {
		const days = [
			{ date: '2024-01-01', calories: 2000 },
			{ date: '2024-01-02', calories: 2000 },
			{ date: '2024-01-03', calories: 2000 },
			{ date: '2024-01-04', calories: 3000 },
			{ date: '2024-01-05', calories: 1000 }
		];
		const result = computeCalorieCycling(days);
		expect(result.highDays).toBe(1);
		expect(result.lowDays).toBe(1);
	});

	test('returns zero values for empty input', () => {
		const result = computeCalorieCycling([]);
		expect(result.sampleSize).toBe(0);
		expect(result.confidence).toBe('insufficient');
	});
});
