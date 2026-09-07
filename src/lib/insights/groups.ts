import * as m from '$lib/paraglide/messages';
import { formatKcal, formatKg } from '$lib/utils/number';
import type { AnalyticsBundle } from './sources';

export const INSIGHT_GROUP_IDS = [
	'nutrition-patterns',
	'nutrition-correlations',
	'weight-insights',
	'weight-correlations',
	'sleep-insights'
] as const;

export type InsightGroupId = (typeof INSIGHT_GROUP_IDS)[number];

export type InsightGroupMeta = {
	id: InsightGroupId;
	title: () => string;
	/** Days of usable data behind the group; drives the "needs N more days" hint. */
	days: (bundle: AnalyticsBundle) => number;
	minDays: number;
	teaser: (bundle: AnalyticsBundle) => string | null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const uniqueDates = (rows: readonly { date: string }[]) => new Set(rows.map((r) => r.date)).size;

const avgDailyCalories = (rows: readonly { date: string; calories: number }[]) => {
	const byDate = new Map<string, number>();
	for (const row of rows) byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.calories);
	if (byDate.size === 0) return null;
	let total = 0;
	for (const value of byDate.values()) total += value;
	return total / byDate.size;
};

const minutesOfDay = (iso: string | null) => {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return date.getHours() * 60 + date.getMinutes();
};

const avgEatingWindowHours = (rows: readonly { date: string; eatenAt: string | null }[]) => {
	const byDate = new Map<string, { min: number; max: number }>();
	for (const row of rows) {
		const minute = minutesOfDay(row.eatenAt);
		if (minute === null) continue;
		const current = byDate.get(row.date);
		if (!current) byDate.set(row.date, { min: minute, max: minute });
		else {
			current.min = Math.min(current.min, minute);
			current.max = Math.max(current.max, minute);
		}
	}
	if (byDate.size === 0) return null;
	let total = 0;
	for (const span of byDate.values()) total += span.max - span.min;
	return total / byDate.size / 60;
};

const weeklyWeightRate = (rows: readonly { date: string; movingAvg: number | null }[]) => {
	const points = rows
		.filter((r): r is { date: string; movingAvg: number } => r.movingAvg !== null)
		.sort((a, b) => a.date.localeCompare(b.date));
	if (points.length < 2) return null;
	const first = points[0];
	const last = points[points.length - 1];
	const spanDays =
		(new Date(`${last.date}T00:00:00Z`).getTime() - new Date(`${first.date}T00:00:00Z`).getTime()) /
		86_400_000;
	if (spanDays < 7) return null;
	return ((last.movingAvg - first.movingAvg) / spanDays) * 7;
};

const pairedWeightFoodDays = (
	rows: readonly { calories: number | null; weightKg: number | null }[]
) => rows.filter((r) => r.calories !== null && r.weightKg !== null).length;

const avgSleepHours = (rows: readonly { sleepDurationMinutes: number }[]) => {
	if (rows.length === 0) return null;
	const total = rows.reduce((sum, r) => sum + r.sleepDurationMinutes, 0);
	return total / rows.length / 60;
};

export const INSIGHT_GROUPS: Record<InsightGroupId, InsightGroupMeta> = {
	'nutrition-patterns': {
		id: 'nutrition-patterns',
		title: m.insights_group_nutrition_patterns,
		minDays: 7,
		days: (b) => uniqueDates(b.nutrientsExtended90),
		teaser: (b) => {
			const avg = avgDailyCalories(b.nutrientsExtended90);
			return avg === null ? null : m.insights_teaser_avg_calories({ value: formatKcal(avg) });
		}
	},
	'nutrition-correlations': {
		id: 'nutrition-correlations',
		title: m.insights_group_nutrition_correlations,
		minDays: 7,
		days: (b) => uniqueDates(b.mealTiming30),
		teaser: (b) => {
			const hours = avgEatingWindowHours(b.mealTiming30);
			return hours === null
				? null
				: m.insights_teaser_eating_window({ hours: round1(hours).toString() });
		}
	},
	'weight-insights': {
		id: 'weight-insights',
		title: m.insights_group_weight_insights,
		minDays: 14,
		days: (b) => b.weightFood90.filter((r) => r.weightKg !== null).length,
		teaser: (b) => {
			const rate = weeklyWeightRate(b.weightFood90);
			if (rate === null) return null;
			const sign = rate > 0 ? '+' : '';
			return m.insights_teaser_weight_trend({ value: `${sign}${formatKg(rate)}` });
		}
	},
	'weight-correlations': {
		id: 'weight-correlations',
		title: m.insights_group_weight_correlations,
		minDays: 14,
		days: (b) => pairedWeightFoodDays(b.weightFood30),
		teaser: (b) => {
			const days = pairedWeightFoodDays(b.weightFood30);
			return days === 0 ? null : m.insights_teaser_paired_days({ days: days.toString() });
		}
	},
	'sleep-insights': {
		id: 'sleep-insights',
		title: m.insights_group_sleep_insights,
		minDays: 7,
		days: (b) => b.sleepFood60.length,
		teaser: (b) => {
			const hours = avgSleepHours(b.sleepFood60);
			return hours === null
				? null
				: m.insights_teaser_avg_sleep({ hours: round1(hours).toString() });
		}
	}
};

export const insightGroupTestables = {
	avgDailyCalories,
	avgEatingWindowHours,
	weeklyWeightRate,
	pairedWeightFoodDays,
	avgSleepHours
};
