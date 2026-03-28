import { type ConfidenceLevel, getConfidenceLevel } from './correlation';

export type CaffeineSleepResult = {
	estimatedCutoffHour: number | null;
	hourlyImpact: { hour: number; avgQuality: number; avgDuration: number; count: number }[];
	confidence: ConfidenceLevel;
	sampleSize: number;
};

function getNextDate(dateStr: string): string {
	const [year, month, day] = dateStr.split('-').map(Number);
	const d = new Date(Date.UTC(year, month - 1, day + 1));
	return d.toISOString().slice(0, 10);
}

export function computeCaffeineSleepCutoff(
	caffeineEntries: { date: string; eatenAt: string | null; caffeine: number }[],
	sleepData: { date: string; sleepQuality: number | null; sleepDurationMinutes: number | null }[]
): CaffeineSleepResult {
	const sleepByDate = new Map<string, { quality: number; duration: number }>();
	for (const s of sleepData) {
		if (s.sleepQuality !== null && s.sleepDurationMinutes !== null) {
			sleepByDate.set(s.date, { quality: s.sleepQuality, duration: s.sleepDurationMinutes });
		}
	}

	const lastCaffeineHourByDate = new Map<string, number>();
	for (const entry of caffeineEntries) {
		if (!entry.eatenAt || entry.caffeine <= 0) continue;
		const hour = new Date(entry.eatenAt).getHours();
		const existing = lastCaffeineHourByDate.get(entry.date);
		if (existing === undefined || hour > existing) {
			lastCaffeineHourByDate.set(entry.date, hour);
		}
	}

	const hourBuckets = new Map<number, { quality: number[]; duration: number[] }>();
	for (const [date, lastHour] of lastCaffeineHourByDate) {
		const nextDate = getNextDate(date);
		const sleep = sleepByDate.get(nextDate);
		if (!sleep) continue;

		if (!hourBuckets.has(lastHour)) hourBuckets.set(lastHour, { quality: [], duration: [] });
		hourBuckets.get(lastHour)!.quality.push(sleep.quality);
		hourBuckets.get(lastHour)!.duration.push(sleep.duration);
	}

	const hourlyImpact = [...hourBuckets.entries()]
		.sort(([a], [b]) => a - b)
		.map(([hour, { quality, duration }]) => ({
			hour,
			avgQuality: quality.reduce((s, v) => s + v, 0) / quality.length,
			avgDuration: duration.reduce((s, v) => s + v, 0) / duration.length,
			count: quality.length
		}));

	const sampleSize = hourlyImpact.reduce((s, h) => s + h.count, 0);

	let estimatedCutoffHour: number | null = null;
	let bestDelta = 0;

	for (let candidate = 12; candidate <= 20; candidate++) {
		const before = hourlyImpact.filter((h) => h.hour < candidate && h.count >= 1);
		const after = hourlyImpact.filter((h) => h.hour >= candidate && h.count >= 1);

		const beforeCount = before.reduce((s, h) => s + h.count, 0);
		const afterCount = after.reduce((s, h) => s + h.count, 0);

		if (beforeCount < 3 || afterCount < 3) continue;

		const beforeQuality = before.reduce((s, h) => s + h.avgQuality * h.count, 0) / beforeCount;
		const afterQuality = after.reduce((s, h) => s + h.avgQuality * h.count, 0) / afterCount;

		const delta = beforeQuality - afterQuality;
		if (delta > 0.5 && delta > bestDelta) {
			bestDelta = delta;
			estimatedCutoffHour = candidate;
		}
	}

	return {
		estimatedCutoffHour,
		hourlyImpact,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}
