import { circularMeanMinutes, localMinutesOfDay } from '$lib/analytics/local-time';
import { extractMealTimingPatterns } from '$lib/analytics/meal-timing';
import { computeMealRegularity } from '$lib/analytics/meal-regularity';
import { computeCalorieCycling, computeCalorieFrontLoading } from '$lib/analytics/calorie-patterns';
import { computeWeekdayWeekendSplit } from '$lib/analytics/weekday-weekend';
import {
	computeProteinDistribution,
	proteinPerMealThreshold
} from '$lib/analytics/protein-distribution';
import { computeFoodDiversity } from '$lib/analytics/food-diversity';

/**
 * Composes the existing pure analytics functions into one habit picture, server-side.
 * Nothing here recomputes what `$lib/analytics` already does — the only new logic is
 * `summarizeMealSlots`, which is server-only so it takes on no Kotlin-parity obligation.
 */

export type PatternEntry = {
	date: string;
	mealType: string;
	eatenAt: string | null;
	calories: number;
	protein: number;
	foodId: string | null;
	recipeId: string | null;
	foodName: string;
};

export type PatternDay = {
	date: string;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
};

export type MealSlotSummary = {
	mealType: string;
	daysLogged: number;
	sharePct: number;
	avgCalories: number;
	avgProtein: number;
	/** Circular mean of the local clock time, HH:MM, or null when nothing carried a time. */
	avgTimeHHmm: string | null;
};

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Per-meal-slot habits: how much of the day's energy each slot carries and when it lands.
 * Clock times are averaged circularly — a linear mean of 23:50 and 00:10 gives noon.
 */
export function summarizeMealSlots(entries: PatternEntry[], timeZone: string): MealSlotSummary[] {
	const slots = new Map<
		string,
		{ calories: number; protein: number; dates: Set<string>; minutes: number[] }
	>();
	let totalCalories = 0;

	for (const entry of entries) {
		const mealType = entry.mealType || 'Unknown';
		let slot = slots.get(mealType);
		if (!slot) {
			slot = { calories: 0, protein: 0, dates: new Set(), minutes: [] };
			slots.set(mealType, slot);
		}
		slot.calories += entry.calories;
		slot.protein += entry.protein;
		slot.dates.add(entry.date);
		totalCalories += entry.calories;
		if (entry.eatenAt) {
			const minutes = localMinutesOfDay(entry.eatenAt, timeZone);
			if (minutes !== null) slot.minutes.push(minutes);
		}
	}

	return [...slots.entries()]
		.map(([mealType, slot]) => {
			const daysLogged = slot.dates.size;
			const meanMinutes = circularMeanMinutes(slot.minutes);
			return {
				mealType,
				daysLogged,
				sharePct: totalCalories > 0 ? (slot.calories / totalCalories) * 100 : 0,
				avgCalories: daysLogged > 0 ? slot.calories / daysLogged : 0,
				avgProtein: daysLogged > 0 ? slot.protein / daysLogged : 0,
				avgTimeHHmm:
					meanMinutes === null
						? null
						: `${pad(Math.floor(meanMinutes / 60) % 24)}:${pad(Math.round(meanMinutes) % 60)}`
			};
		})
		.sort((a, b) => b.sharePct - a.sharePct);
}

export type EatingPatterns = ReturnType<typeof buildEatingPatterns>;

/**
 * `foodDiversity.weeklyData` is capped and `mealTiming.dailyWindows` dropped on purpose:
 * this payload goes into an LLM context, and per-day series are what make it large
 * without making it more useful.
 */
export function buildEatingPatterns(args: {
	entries: PatternEntry[];
	days: PatternDay[];
	timeZone: string;
	bodyWeightKg: number | null;
	maxDiversityWeeks?: number;
}) {
	const { entries, days, timeZone, bodyWeightKg } = args;
	const maxDiversityWeeks = args.maxDiversityWeeks ?? 8;

	const timing = extractMealTimingPatterns(entries, timeZone);
	const { dailyWindows: _dailyWindows, ...mealTiming } = timing;

	const diversity = computeFoodDiversity(entries);
	const proteinThresholdG = proteinPerMealThreshold(bodyWeightKg);

	return {
		timeZone,
		mealTiming,
		mealRegularity: computeMealRegularity(entries, timeZone),
		calorieFrontLoading: computeCalorieFrontLoading(entries, timeZone),
		calorieCycling: computeCalorieCycling(days),
		weekdayWeekend: computeWeekdayWeekendSplit(days),
		proteinDistribution: computeProteinDistribution(entries, proteinThresholdG),
		proteinThresholdG,
		mealSlots: summarizeMealSlots(entries, timeZone),
		foodDiversity: {
			...diversity,
			weeklyData: diversity.weeklyData.slice(-maxDiversityWeeks)
		}
	};
}
