import { describe, it, expect } from 'vitest';
import { extractMealTimingPatterns } from '../meal-timing';

describe('extractMealTimingPatterns', () => {
	it('computes basic eating window for a single day', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T08:00:00+00:00', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T12:30:00+00:00', calories: 600 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T19:00:00+00:00', calories: 700 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows).toHaveLength(1);
		const day = result.dailyWindows[0];
		expect(day.firstMealTime).toBe('08:00');
		expect(day.lastMealTime).toBe('19:00');
		expect(day.windowMinutes).toBe(660);
		expect(day.mealCount).toBe(3);
		expect(day.lateNightMeals).toBe(0);
	});

	it('detects late-night meals after 21:00', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T08:00:00+00:00', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T22:30:00+00:00', calories: 400 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T23:00:00+00:00', calories: 200 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows[0].lateNightMeals).toBe(2);
		expect(result.lateNightFrequency).toBe(100);
	});

	it('skips entries without eatenAt', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: null, calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T12:00:00+00:00', calories: 600 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows[0].mealCount).toBe(1);
	});

	it('computes correct hourly distribution', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T07:30:00+00:00', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T07:45:00+00:00', calories: 100 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T12:00:00+00:00', calories: 600 },
			{ date: '2024-01-02', eatenAt: '2024-01-02T12:30:00+00:00', calories: 500 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.hourlyDistribution[7]).toBe(2);
		expect(result.hourlyDistribution[12]).toBe(2);
		expect(result.hourlyDistribution[0]).toBe(0);
		expect(result.hourlyDistribution).toHaveLength(24);
	});

	it('window is 0 for single meal per day', () => {
		const entries = [{ date: '2024-01-01', eatenAt: '2024-01-01T12:00:00+00:00', calories: 600 }];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows[0].windowMinutes).toBe(0);
		expect(result.dailyWindows[0].firstMealTime).toBe('12:00');
		expect(result.dailyWindows[0].lastMealTime).toBe('12:00');
	});

	it('applies timezone offset from ISO string correctly', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T08:00:00+02:00', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T18:00:00+02:00', calories: 600 }
		];
		const result = extractMealTimingPatterns(entries);
		const day = result.dailyWindows[0];
		expect(day.firstMealTime).toBe('08:00');
		expect(day.lastMealTime).toBe('18:00');
	});

	it('returns empty summary for all-null eatenAt', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: null, calories: 300 },
			{ date: '2024-01-02', eatenAt: null, calories: 400 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows).toHaveLength(0);
		expect(result.avgWindowMinutes).toBe(0);
		expect(result.lateNightFrequency).toBe(0);
	});

	it('returns lateNightFrequency as percentage of days with late eating', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T08:00:00+00:00', calories: 300 },
			{ date: '2024-01-02', eatenAt: '2024-01-02T22:00:00+00:00', calories: 400 },
			{ date: '2024-01-03', eatenAt: '2024-01-03T12:00:00+00:00', calories: 500 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.lateNightFrequency).toBeCloseTo(33.33, 1);
	});
});
