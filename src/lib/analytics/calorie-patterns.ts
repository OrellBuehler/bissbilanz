import { type ConfidenceLevel, getConfidenceLevel } from './correlation';
import { eatingDayOf, EATING_DAY_BOUNDARY_MINUTES } from './local-time';

export type FrontLoadingResult = {
	avgMorningPct: number;
	daysAbove50Pct: number;
	totalDays: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export type CalorieCyclingResult = {
	mean: number;
	stddev: number;
	cv: number;
	pattern: 'consistent' | 'moderate' | 'high_variance';
	highDays: number;
	lowDays: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

/**
 * Share of each eating day's calories logged before `cutoffHour` local. Days
 * start at 04:00 (see `eatingDayOf`), so a 01:00 snack lands in the previous
 * evening rather than counting as "morning" calories for the calendar date.
 */
export function computeCalorieFrontLoading(
	entries: { date: string; eatenAt: string | null; calories: number }[],
	timeZone: string,
	cutoffHour = 14
): FrontLoadingResult {
	const byDate = new Map<string, { morning: number; total: number }>();
	const cutoffMinutes = cutoffHour * 60 - EATING_DAY_BOUNDARY_MINUTES;

	for (const entry of entries) {
		if (!entry.eatenAt) continue;
		const point = eatingDayOf(entry.eatenAt, timeZone);
		if (point === null) continue;
		if (!byDate.has(point.date)) byDate.set(point.date, { morning: 0, total: 0 });
		const day = byDate.get(point.date)!;
		day.total += entry.calories;
		if (point.minutes < cutoffMinutes) day.morning += entry.calories;
	}

	const days = [...byDate.values()];
	const sampleSize = days.length;

	if (sampleSize === 0) {
		return {
			avgMorningPct: 0,
			daysAbove50Pct: 0,
			totalDays: 0,
			confidence: 'insufficient',
			sampleSize: 0
		};
	}

	const morningPcts = days.map((d) => (d.total > 0 ? (d.morning / d.total) * 100 : 0));
	const avgMorningPct = morningPcts.reduce((s, v) => s + v, 0) / sampleSize;
	const daysAbove50Pct = morningPcts.filter((p) => p > 50).length;

	return {
		avgMorningPct,
		daysAbove50Pct,
		totalDays: sampleSize,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}

export function computeCalorieCycling(
	dailyNutrients: { date: string; calories: number }[]
): CalorieCyclingResult {
	const sampleSize = dailyNutrients.length;

	if (sampleSize === 0) {
		return {
			mean: 0,
			stddev: 0,
			cv: 0,
			pattern: 'consistent',
			highDays: 0,
			lowDays: 0,
			confidence: 'insufficient',
			sampleSize: 0
		};
	}

	const calories = dailyNutrients.map((d) => d.calories);
	const mean = calories.reduce((s, v) => s + v, 0) / sampleSize;
	const variance = calories.reduce((s, v) => s + (v - mean) ** 2, 0) / sampleSize;
	const stddev = Math.sqrt(variance);
	const cv = mean > 0 ? (stddev / mean) * 100 : 0;

	const pattern: CalorieCyclingResult['pattern'] =
		cv < 15 ? 'consistent' : cv < 30 ? 'moderate' : 'high_variance';

	const highDays = calories.filter((c) => c > mean + stddev).length;
	const lowDays = calories.filter((c) => c < mean - stddev).length;

	return {
		mean,
		stddev,
		cv,
		pattern,
		highDays,
		lowDays,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}
