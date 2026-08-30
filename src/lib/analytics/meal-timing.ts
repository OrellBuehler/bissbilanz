import { eatingDayOf, circularMeanMinutes, EATING_DAY_BOUNDARY_MINUTES } from './local-time';

export type DailyEatingWindow = {
	/** The eating day (04:00–03:59 local) the meals were assigned to. */
	date: string;
	firstMealTime: string;
	lastMealTime: string;
	windowMinutes: number;
	mealCount: number;
	/** Meals at or after 21:00, including post-midnight ones before 04:00. */
	lateNightMeals: number;
};

export type MealTimingSummary = {
	dailyWindows: DailyEatingWindow[];
	avgWindowMinutes: number;
	/** Circular mean of the first-meal clock time. */
	avgFirstMealTime: string;
	/** Circular mean of the last-meal clock time. */
	avgLastMealTime: string;
	lateNightFrequency: number;
	hourlyDistribution: number[];
};

const MINUTES_PER_DAY = 1440;
const LATE_NIGHT_FROM_MINUTES = 21 * 60;

/**
 * Daily eating windows. Meals are grouped by *eating day* — a rolling day
 * starting at 04:00 local — rather than by the calendar date, so a 00:30 snack
 * extends the previous evening's window instead of becoming the next day's
 * "first meal" and shrinking that day's window by ~14 hours. Within a day the
 * arithmetic runs on minutes since the 04:00 boundary, which cannot wrap.
 */
export function extractMealTimingPatterns(
	entries: { date: string; eatenAt: string | null; calories: number }[],
	timeZone: string
): MealTimingSummary {
	const hourlyDistribution = new Array<number>(24).fill(0);

	const byDate = new Map<string, { minutes: number; clockMinutes: number }[]>();

	for (const entry of entries) {
		if (!entry.eatenAt) continue;

		const point = eatingDayOf(entry.eatenAt, timeZone);
		if (point === null) continue;

		hourlyDistribution[Math.floor(point.clockMinutes / 60)]++;

		if (!byDate.has(point.date)) {
			byDate.set(point.date, []);
		}
		byDate.get(point.date)!.push({ minutes: point.minutes, clockMinutes: point.clockMinutes });
	}

	const dailyWindows: DailyEatingWindow[] = [];
	const firstClockMinutes: number[] = [];
	const lastClockMinutes: number[] = [];

	for (const [date, meals] of byDate) {
		const minutes = meals.map((m) => m.minutes);
		const first = Math.min(...minutes);
		const last = Math.max(...minutes);
		const lateNightMeals = meals.filter(
			(m) => m.minutes >= LATE_NIGHT_FROM_MINUTES - EATING_DAY_BOUNDARY_MINUTES
		).length;
		const firstClock = toClock(first);
		const lastClock = toClock(last);
		firstClockMinutes.push(firstClock);
		lastClockMinutes.push(lastClock);

		dailyWindows.push({
			date,
			firstMealTime: minutesToHHmm(firstClock),
			lastMealTime: minutesToHHmm(lastClock),
			windowMinutes: last - first,
			mealCount: meals.length,
			lateNightMeals
		});
	}

	dailyWindows.sort((a, b) => a.date.localeCompare(b.date));

	if (dailyWindows.length === 0) {
		return {
			dailyWindows: [],
			avgWindowMinutes: 0,
			avgFirstMealTime: '00:00',
			avgLastMealTime: '00:00',
			lateNightFrequency: 0,
			hourlyDistribution
		};
	}

	const avgWindowMinutes =
		dailyWindows.reduce((sum, d) => sum + d.windowMinutes, 0) / dailyWindows.length;

	const avgFirstMinutes = circularMeanMinutes(firstClockMinutes) ?? 0;
	const avgLastMinutes = circularMeanMinutes(lastClockMinutes) ?? 0;

	const daysWithLateNight = dailyWindows.filter((d) => d.lateNightMeals > 0).length;
	const lateNightFrequency = (daysWithLateNight / dailyWindows.length) * 100;

	return {
		dailyWindows,
		avgWindowMinutes,
		avgFirstMealTime: minutesToHHmm(Math.round(avgFirstMinutes) % MINUTES_PER_DAY),
		avgLastMealTime: minutesToHHmm(Math.round(avgLastMinutes) % MINUTES_PER_DAY),
		lateNightFrequency,
		hourlyDistribution
	};
}

/** Minutes since the eating-day boundary → minutes since real midnight. */
function toClock(minutesSinceBoundary: number): number {
	return (minutesSinceBoundary + EATING_DAY_BOUNDARY_MINUTES) % MINUTES_PER_DAY;
}

function minutesToHHmm(totalMinutes: number): string {
	const h = Math.floor(totalMinutes / 60) % 24;
	const m = totalMinutes % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
