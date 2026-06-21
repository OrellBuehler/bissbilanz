import { describe, it, expect } from 'vitest';
import { extractMealTimingPatterns } from '../meal-timing';

describe('extractMealTimingPatterns', () => {
	it('computes basic eating window for a single day', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T08:00:00+00:00', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T12:30:00+00:00', calories: 600 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T19:00:00+00:00', calories: 700 }
		];
		const result = extractMealTimingPatterns(entries, 'UTC');
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
		const result = extractMealTimingPatterns(entries, 'UTC');
		expect(result.dailyWindows[0].lateNightMeals).toBe(2);
		expect(result.lateNightFrequency).toBe(100);
	});

	it('skips entries without eatenAt', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: null, calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T12:00:00+00:00', calories: 600 }
		];
		const result = extractMealTimingPatterns(entries, 'UTC');
		expect(result.dailyWindows[0].mealCount).toBe(1);
	});

	it('computes correct hourly distribution', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T07:30:00+00:00', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T07:45:00+00:00', calories: 100 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T12:00:00+00:00', calories: 600 },
			{ date: '2024-01-02', eatenAt: '2024-01-02T12:30:00+00:00', calories: 500 }
		];
		const result = extractMealTimingPatterns(entries, 'UTC');
		expect(result.hourlyDistribution[7]).toBe(2);
		expect(result.hourlyDistribution[12]).toBe(2);
		expect(result.hourlyDistribution[0]).toBe(0);
		expect(result.hourlyDistribution).toHaveLength(24);
	});

	it('window is 0 for single meal per day', () => {
		const entries = [{ date: '2024-01-01', eatenAt: '2024-01-01T12:00:00+00:00', calories: 600 }];
		const result = extractMealTimingPatterns(entries, 'UTC');
		expect(result.dailyWindows[0].windowMinutes).toBe(0);
		expect(result.dailyWindows[0].firstMealTime).toBe('12:00');
		expect(result.dailyWindows[0].lastMealTime).toBe('12:00');
	});

	it('buckets the UTC instant into the requested timezone (DST-correct)', () => {
		// 08:00Z and 18:00Z rendered in Europe/Zurich (winter, UTC+1) => 09:00, 19:00.
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T08:00:00Z', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T18:00:00Z', calories: 600 }
		];
		const result = extractMealTimingPatterns(entries, 'Europe/Zurich');
		const day = result.dailyWindows[0];
		expect(day.firstMealTime).toBe('09:00');
		expect(day.lastMealTime).toBe('19:00');
	});

	it('returns empty summary for all-null eatenAt', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: null, calories: 300 },
			{ date: '2024-01-02', eatenAt: null, calories: 400 }
		];
		const result = extractMealTimingPatterns(entries, 'UTC');
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
		const result = extractMealTimingPatterns(entries, 'UTC');
		expect(result.lateNightFrequency).toBeCloseTo(33.33, 1);
	});

	it('resolves the same instant differently per timezone', () => {
		// 18:30Z is 00:00 next day in India (UTC+5:30) and 10:30 in PST (UTC-8).
		const entries = [{ date: '2024-01-01', eatenAt: '2024-01-01T18:30:00Z', calories: 500 }];
		expect(extractMealTimingPatterns(entries, 'Asia/Kolkata').dailyWindows[0].firstMealTime).toBe(
			'00:00'
		);
		expect(
			extractMealTimingPatterns(entries, 'America/Los_Angeles').dailyWindows[0].firstMealTime
		).toBe('10:30');
	});

	it('handles UTC (Z) timezone correctly', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T09:00:00Z', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T18:00:00Z', calories: 600 }
		];
		const result = extractMealTimingPatterns(entries, 'UTC');
		expect(result.dailyWindows[0].firstMealTime).toBe('09:00');
		expect(result.dailyWindows[0].lastMealTime).toBe('18:00');
		expect(result.dailyWindows[0].windowMinutes).toBe(540);
	});

	it('normalizes mixed offset notations to the same instant', () => {
		// 09:00Z and 10:00+01:00 are the same instant; in UTC both bucket to 09:00.
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T09:00:00Z', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T10:00:00+01:00', calories: 600 }
		];
		const result = extractMealTimingPatterns(entries, 'UTC');
		expect(result.dailyWindows).toHaveLength(1);
		expect(result.dailyWindows[0].firstMealTime).toBe('09:00');
		expect(result.dailyWindows[0].lastMealTime).toBe('09:00');
		expect(result.dailyWindows[0].mealCount).toBe(2);
	});

	it('handles timestamps with seconds and milliseconds', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T07:30:45.123+00:00', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T19:15:30.000+00:00', calories: 700 }
		];
		const result = extractMealTimingPatterns(entries, 'UTC');
		expect(result.dailyWindows[0].firstMealTime).toBe('07:30');
		expect(result.dailyWindows[0].lastMealTime).toBe('19:15');
	});

	it('single entry per day yields window of 0 minutes', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T12:00:00Z', calories: 600 },
			{ date: '2024-01-02', eatenAt: '2024-01-02T08:30:00Z', calories: 400 }
		];
		const result = extractMealTimingPatterns(entries, 'UTC');
		expect(result.dailyWindows).toHaveLength(2);
		for (const day of result.dailyWindows) {
			expect(day.windowMinutes).toBe(0);
			expect(day.firstMealTime).toBe(day.lastMealTime);
		}
	});
});
