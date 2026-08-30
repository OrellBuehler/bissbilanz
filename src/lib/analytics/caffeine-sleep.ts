import { type ConfidenceLevel, getConfidenceLevel } from './correlation';
import { localMinutesOfDay } from './local-time';
import { welchTTest, mean } from './stats';
import { DEFAULT_CAFFEINE_CUTOFF_HOUR } from './constants.generated';

export type CaffeineSleepResult = {
	/** A personal cutoff, only when the split survives a multiplicity-corrected test. */
	estimatedCutoffHour: number | null;
	/**
	 * Literature default to fall back on: 400 mg six hours before bed still cost
	 * over an hour of sleep (Drake 2013) and the meta-analytic abstention window
	 * is ~9 h (Gardiner 2023), i.e. ~14:00 for a 23:00 bedtime.
	 */
	defaultCutoffHour: number;
	/** Bonferroni-corrected p-value of the best split, null when nothing was testable. */
	pValue: number | null;
	/** Number of candidate cutoffs that had enough nights on both sides to test. */
	comparisons: number;
	hourlyImpact: { hour: number; avgQuality: number; avgDuration: number; count: number }[];
	confidence: ConfidenceLevel;
	sampleSize: number;
};

const MIN_NIGHTS_PER_SIDE = 5;
const MIN_QUALITY_DELTA = 0.5;
const SIGNIFICANCE = 0.05;

function getNextDate(dateStr: string): string {
	const [year, month, day] = dateStr.split('-').map(Number);
	const d = new Date(Date.UTC(year, month - 1, day + 1));
	return d.toISOString().slice(0, 10);
}

/**
 * Buckets nights by the hour of the day's last caffeine and scans cutoffs
 * 12:00–20:00 for the split with the strongest quality drop. Nine candidate
 * split points searched for a maximum is a maximally-selected statistic, so
 * the winner's Welch p-value is Bonferroni-corrected over the candidates that
 * were actually testable before it may replace the literature default.
 */
export function computeCaffeineSleepCutoff(
	caffeineEntries: { date: string; eatenAt: string | null; caffeine: number }[],
	sleepData: { date: string; sleepQuality: number | null; sleepDurationMinutes: number | null }[],
	timeZone: string
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
		const minutes = localMinutesOfDay(entry.eatenAt, timeZone);
		if (minutes === null) continue;
		const hour = Math.floor(minutes / 60);
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

	const sortedBuckets = [...hourBuckets.entries()].sort(([a], [b]) => a - b);
	const hourlyImpact = sortedBuckets.map(([hour, { quality, duration }]) => ({
		hour,
		avgQuality: mean(quality),
		avgDuration: mean(duration),
		count: quality.length
	}));

	const sampleSize = hourlyImpact.reduce((s, h) => s + h.count, 0);

	let comparisons = 0;
	let bestCandidate: number | null = null;
	let bestP = 1;

	for (let candidate = 12; candidate <= 20; candidate++) {
		const before = sortedBuckets.filter(([hour]) => hour < candidate).flatMap(([, b]) => b.quality);
		const after = sortedBuckets.filter(([hour]) => hour >= candidate).flatMap(([, b]) => b.quality);
		if (before.length < MIN_NIGHTS_PER_SIDE || after.length < MIN_NIGHTS_PER_SIDE) continue;

		comparisons++;
		const delta = mean(before) - mean(after);
		if (delta <= MIN_QUALITY_DELTA) continue;

		const { pValue } = welchTTest(before, after);
		if (pValue < bestP) {
			bestP = pValue;
			bestCandidate = candidate;
		}
	}

	const correctedP = comparisons > 0 ? Math.min(1, bestP * comparisons) : null;
	const estimatedCutoffHour =
		bestCandidate !== null && correctedP !== null && correctedP < SIGNIFICANCE
			? bestCandidate
			: null;

	return {
		estimatedCutoffHour,
		defaultCutoffHour: DEFAULT_CAFFEINE_CUTOFF_HOUR,
		pValue: correctedP,
		comparisons,
		hourlyImpact,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}
