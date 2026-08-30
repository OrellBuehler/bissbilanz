import { describe, test, expect } from 'vitest';
import { computeCaffeineSleepCutoff } from '$lib/analytics/caffeine-sleep';

// localHourTs encodes the hour in the runtime-local timezone (via setHours), so
// reading it back through the function with the same runtime tz round-trips
// regardless of where the test runs.
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function makeSleepData(date: string, quality: number, duration: number) {
	return { date, sleepQuality: quality, sleepDurationMinutes: duration };
}

function localHourTs(date: string, localHour: number): string {
	const d = new Date(`${date}T00:00:00`);
	d.setHours(localHour);
	return d.toISOString();
}

describe('computeCaffeineSleepCutoff', () => {
	test('late caffeine with a clear, repeated sleep penalty yields a personal cutoff', () => {
		// 8 early days (last dose 08:00–11:00) followed by good sleep, 8 late days
		// (18:00–21:00) followed by poor sleep. The split has ≥5 nights a side and
		// survives the Bonferroni correction over the candidates tested.
		const caffeineEntries: { date: string; eatenAt: string; caffeine: number }[] = [];
		const sleepData: ReturnType<typeof makeSleepData>[] = [];
		for (let i = 0; i < 16; i++) {
			const day = `2024-01-${String(i + 1).padStart(2, '0')}`;
			const next = `2024-01-${String(i + 2).padStart(2, '0')}`;
			const late = i % 2 === 1;
			caffeineEntries.push({
				date: day,
				eatenAt: localHourTs(day, late ? 18 + (i % 4) : 8 + (i % 4)),
				caffeine: 100
			});
			sleepData.push(
				makeSleepData(next, late ? 3 + (i % 3) * 0.3 : 8 - (i % 3) * 0.3, late ? 300 : 480)
			);
		}
		const result = computeCaffeineSleepCutoff(caffeineEntries, sleepData, TZ);
		expect(result.estimatedCutoffHour).not.toBeNull();
		expect(result.estimatedCutoffHour!).toBeGreaterThanOrEqual(12);
		expect(result.estimatedCutoffHour!).toBeLessThanOrEqual(18);
		expect(result.comparisons).toBeGreaterThan(0);
		expect(result.pValue!).toBeLessThan(0.05);
		expect(result.defaultCutoffHour).toBe(14);
	});

	test('three nights a side is not enough to override the literature default', () => {
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
		const result = computeCaffeineSleepCutoff(caffeineEntries, sleepData, TZ);
		expect(result.estimatedCutoffHour).toBeNull();
		expect(result.comparisons).toBe(0);
		expect(result.defaultCutoffHour).toBe(14);
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
		const result = computeCaffeineSleepCutoff(caffeineEntries, sleepData, TZ);
		expect(result.estimatedCutoffHour).toBeNull();
	});

	test('no caffeine data returns null cutoff and empty hourly impact', () => {
		const sleepData = [makeSleepData('2024-01-02', 8, 480), makeSleepData('2024-01-03', 7, 450)];
		const result = computeCaffeineSleepCutoff([], sleepData, TZ);
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
		const result = computeCaffeineSleepCutoff(caffeineEntries, sleepData, TZ);
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
		const result = computeCaffeineSleepCutoff(caffeineEntries, sleepData, TZ);
		expect(result.hourlyImpact).toHaveLength(1);
	});

	test('confidence reflects sample size', () => {
		const result = computeCaffeineSleepCutoff([], [], TZ);
		expect(result.confidence).toBe('insufficient');
	});
});
