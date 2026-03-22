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
		// T08:00+02:00 means the string hours (08) are treated as UTC, offset converts to local
		// UTC 08:00 + 02:00 offset = local 10:00
		// UTC 18:00 + 02:00 offset = local 20:00
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T08:00:00+02:00', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T18:00:00+02:00', calories: 600 }
		];
		const result = extractMealTimingPatterns(entries);
		const day = result.dailyWindows[0];
		expect(day.firstMealTime).toBe('10:00');
		expect(day.lastMealTime).toBe('20:00');
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

	it('handles India timezone offset +05:30 correctly', () => {
		// parseLocalMinutes treats digits as UTC, then adds offset
		// T12:30+05:30: utcMinutes=750, offset=+330 => localMinutes=1080 => 18:00
		const entries = [{ date: '2024-01-01', eatenAt: '2024-01-01T12:30:00+05:30', calories: 500 }];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows).toHaveLength(1);
		expect(result.dailyWindows[0].firstMealTime).toBe('18:00');
	});

	it('handles PST timezone offset -08:00 correctly', () => {
		// parseLocalMinutes treats digits as UTC, then adds offset
		// T20:00-08:00: utcMinutes=1200, offset=-480 => localMinutes=720 => 12:00
		// T08:00-08:00: utcMinutes=480, offset=-480 => localMinutes=0 => 00:00
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T20:00:00-08:00', calories: 500 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T08:00:00-08:00', calories: 300 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows).toHaveLength(1);
		expect(result.dailyWindows[0].firstMealTime).toBe('00:00');
		expect(result.dailyWindows[0].lastMealTime).toBe('12:00');
	});

	it('handles UTC (Z) timezone correctly', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T09:00:00Z', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T18:00:00Z', calories: 600 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows[0].firstMealTime).toBe('09:00');
		expect(result.dailyWindows[0].lastMealTime).toBe('18:00');
		expect(result.dailyWindows[0].windowMinutes).toBe(540);
	});

	it('handles mixed timezone offsets in the same dataset', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T09:00:00Z', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T18:00:00+02:00', calories: 600 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows).toHaveLength(1);
		// Z entry = 09:00 local; +02:00 entry = 20:00 local
		expect(result.dailyWindows[0].firstMealTime).toBe('09:00');
		expect(result.dailyWindows[0].lastMealTime).toBe('20:00');
	});

	it('handles timestamps with seconds and milliseconds', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T07:30:45.123+00:00', calories: 300 },
			{ date: '2024-01-01', eatenAt: '2024-01-01T19:15:30.000+00:00', calories: 700 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows[0].firstMealTime).toBe('07:30');
		expect(result.dailyWindows[0].lastMealTime).toBe('19:15');
	});

	it('single entry per day yields window of 0 minutes', () => {
		const entries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T12:00:00Z', calories: 600 },
			{ date: '2024-01-02', eatenAt: '2024-01-02T08:30:00Z', calories: 400 }
		];
		const result = extractMealTimingPatterns(entries);
		expect(result.dailyWindows).toHaveLength(2);
		for (const day of result.dailyWindows) {
			expect(day.windowMinutes).toBe(0);
			expect(day.firstMealTime).toBe(day.lastMealTime);
		}
	});
});
