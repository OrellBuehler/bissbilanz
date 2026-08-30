import { type ConfidenceLevel, getConfidenceLevel } from './correlation';
import { welchTTest } from './stats';

export type DayStats = {
	avgCalories: number;
	avgProtein: number;
	avgCarbs: number;
	avgFat: number;
	avgFiber: number;
	days: number;
};

export type WeekdayWeekendResult = {
	weekday: DayStats;
	weekend: DayStats;
	calorieDelta: number;
	calorieDeltaPct: number;
	/** Welch t-test of weekend vs weekday calories; null with fewer than two days on a side. */
	pValue: number | null;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

type DayEntry = {
	date: string;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
};

function emptyStats(): DayStats {
	return { avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0, avgFiber: 0, days: 0 };
}

function computeStats(days: DayEntry[]): DayStats {
	if (days.length === 0) return emptyStats();
	const n = days.length;
	return {
		avgCalories: days.reduce((s, d) => s + d.calories, 0) / n,
		avgProtein: days.reduce((s, d) => s + d.protein, 0) / n,
		avgCarbs: days.reduce((s, d) => s + d.carbs, 0) / n,
		avgFat: days.reduce((s, d) => s + d.fat, 0) / n,
		avgFiber: days.reduce((s, d) => s + d.fiber, 0) / n,
		days: n
	};
}

export function computeWeekdayWeekendSplit(dailyNutrients: DayEntry[]): WeekdayWeekendResult {
	const weekdays: DayEntry[] = [];
	const weekends: DayEntry[] = [];

	for (const day of dailyNutrients) {
		const dow = new Date(day.date + 'T00:00:00').getDay();
		if (dow === 0 || dow === 6) {
			weekends.push(day);
		} else {
			weekdays.push(day);
		}
	}

	const weekday = computeStats(weekdays);
	const weekend = computeStats(weekends);
	const calorieDelta = weekend.avgCalories - weekday.avgCalories;
	const calorieDeltaPct = weekday.avgCalories > 0 ? (calorieDelta / weekday.avgCalories) * 100 : 0;
	const pValue =
		weekdays.length >= 2 && weekends.length >= 2
			? welchTTest(
					weekends.map((d) => d.calories),
					weekdays.map((d) => d.calories)
				).pValue
			: null;

	return {
		weekday,
		weekend,
		calorieDelta,
		calorieDeltaPct,
		pValue,
		// Only ~2/7 of the days are weekend days, so the badge reflects the
		// smaller group, not the total.
		confidence: getConfidenceLevel(Math.min(weekdays.length, weekends.length)),
		sampleSize: dailyNutrients.length
	};
}
