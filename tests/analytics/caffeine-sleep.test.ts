import { describe, test, expect } from 'vitest';
import { computeCaffeineSleepCutoff } from '$lib/analytics/caffeine-sleep';

function makeSleepData(date: string, quality: number, duration: number) {
	return { date, sleepQuality: quality, sleepDurationMinutes: duration };
}

function localHourTs(date: string, localHour: number): string {
	const d = new Date(`${date}T00:00:00`);
	d.setHours(localHour);
	return d.toISOString();
}

describe('computeCaffeineSleepCutoff', () => {
	test('late caffeine correlates with poor sleep', () => {
		// caffeine at local hour 19-21 → poor sleep next day
		// caffeine at local hour 8-10 → good sleep next day
		// Need enough samples (3+) on each side of a candidate cutoff
		const caffeineEntries = [
			{ date: '2024-01-01', eatenAt: localHourTs('2024-01-01', 19), caffeine: 100 },
			{ date: '2024-01-02', eatenAt: localHourTs('2024-01-02', 20), caffeine: 100 },
			{ date: '2024-01-03', eatenAt: localHourTs('2024-01-03', 21), caffeine: 100 },
			{ date: '2024-01-07', eatenAt: localHourTs('2024-01-07', 8), caffeine: 100 },
			{ date: '2024-01-08', eatenAt: localHourTs('2024-01-08', 9), caffeine: 100 },
			{ date: '2024-01-09', eatenAt: localHourTs('2024-01-09', 10), caffeine: 100 }
		];
		const sleepData = [
			makeSleepData('2024-01-02', 3, 300),
			makeSleepData('2024-01-03', 2, 280),
			makeSleepData('2024-01-04', 3, 290),
			makeSleepData('2024-01-08', 8, 480),
			makeSleepData('2024-01-09', 9, 500),
			makeSleepData('2024-01-10', 8, 490)
		];
		const result = computeCaffeineSleepCutoff(caffeineEntries, sleepData);
		expect(result.estimatedCutoffHour).not.toBeNull();
	});

	test('early caffeine with no sleep impact gives null cutoff', () => {
		const caffeineEntries = [
			{ date: '2024-01-01', eatenAt: '2024-01-01T08:00:00+00:00', caffeine: 100 },
			{ date: '2024-01-02', eatenAt: '2024-01-02T09:00:00+00:00', caffeine: 100 },
			{ date: '2024-01-03', eatenAt: '2024-01-03T10:00:00+00:00', caffeine: 100 }
		];
		const sleepData = [
			makeSleepData('2024-01-02', 8, 480),
			makeSleepData('2024-01-03', 8, 480),
			makeSleepData('2024-01-04', 8, 480)
		];
		const result = computeCaffeineSleepCutoff(caffeineEntries, sleepData);
		expect(result.estimatedCutoffHour).toBeNull();
	});

	test('no caffeine data returns null cutoff and empty hourly impact', () => {
		const sleepData = [makeSleepData('2024-01-02', 8, 480), makeSleepData('2024-01-03', 7, 450)];
		const result = computeCaffeineSleepCutoff([], sleepData);
		expect(result.estimatedCutoffHour).toBeNull();
		expect(result.hourlyImpact).toHaveLength(0);
		expect(result.sampleSize).toBe(0);
	});

	test('hourlyImpact groups by last caffeine hour', () => {
		const hour = 14;
		// caffeine on day D → sleep on day D+1
		const caffeineEntries = [
			{ date: '2024-01-01', eatenAt: localHourTs('2024-01-01', hour), caffeine: 100 },
			{ date: '2024-01-02', eatenAt: localHourTs('2024-01-02', hour), caffeine: 100 }
		];
		const sleepData = [makeSleepData('2024-01-02', 7, 420), makeSleepData('2024-01-03', 7, 420)];
		const result = computeCaffeineSleepCutoff(caffeineEntries, sleepData);
		expect(result.hourlyImpact).toHaveLength(1);
		expect(result.hourlyImpact[0].hour).toBe(hour);
		expect(result.hourlyImpact[0].count).toBe(2);
	});

	test('skips caffeine entries without eatenAt', () => {
		const caffeineEntries = [
			{ date: '2024-01-01', eatenAt: null, caffeine: 100 },
			{ date: '2024-01-02', eatenAt: localHourTs('2024-01-02', 8), caffeine: 100 }
		];
		const sleepData = [makeSleepData('2024-01-03', 8, 480)];
		const result = computeCaffeineSleepCutoff(caffeineEntries, sleepData);
		expect(result.hourlyImpact).toHaveLength(1);
	});

	test('confidence reflects sample size', () => {
		const result = computeCaffeineSleepCutoff([], []);
		expect(result.confidence).toBe('insufficient');
	});
});
