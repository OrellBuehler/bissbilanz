import { listEntriesByDateRange } from '$lib/server/entries';
import { averageTotals } from '$lib/utils/stats';
import {
	emptyTotals,
	addTotals,
	calculateEntryMacros,
	roundTotals,
	scaleTotals,
	type MacroTotals
} from '$lib/utils/nutrition';
import { today, shiftDate } from '$lib/utils/dates';
import { getDB, foodEntries } from '$lib/server/db';
import { eq, sql } from 'drizzle-orm';
import { getFastingDays } from '$lib/server/day-properties';

export type CalendarDay = { calories: number; hasEntries: boolean };
export type CalendarStats = { days: Record<string, CalendarDay> };

const groupEntriesByDate = (
	entries: Array<{
		date: string;
		servings: number;
		calories: number | null;
		protein: number | null;
		carbs: number | null;
		fat: number | null;
		fiber: number | null;
	}>
): MacroTotals[] => {
	const groups: Record<string, MacroTotals> = {};
	for (const entry of entries) {
		if (!groups[entry.date]) {
			groups[entry.date] = emptyTotals();
		}
		groups[entry.date] = addTotals(groups[entry.date], calculateEntryMacros(entry));
	}
	return Object.values(groups);
};

/**
 * Groups entries by date, including fasting days (0-cal intentional days)
 * in the average calculation.
 */
const groupEntriesByDateWithFasting = (
	entries: Array<{
		date: string;
		servings: number;
		calories: number | null;
		protein: number | null;
		carbs: number | null;
		fat: number | null;
		fiber: number | null;
	}>,
	fastingDays: Set<string>
): MacroTotals[] => {
	const groups: Record<string, MacroTotals> = {};
	for (const entry of entries) {
		if (!groups[entry.date]) {
			groups[entry.date] = emptyTotals();
		}
		groups[entry.date] = addTotals(groups[entry.date], calculateEntryMacros(entry));
	}
	// Include fasting days that have no entries so they count as 0 in averages
	for (const fastingDate of fastingDays) {
		if (!groups[fastingDate]) {
			groups[fastingDate] = emptyTotals();
		}
	}
	return Object.values(groups);
};

export const getWeeklyStats = async (userId: string) => {
	const endDate = today();
	const startDate = shiftDate(endDate, -6);
	const [entries, fastingDaySet] = await Promise.all([
		listEntriesByDateRange(userId, startDate, endDate),
		getFastingDays(userId, startDate, endDate)
	]);
	const dailyTotals = groupEntriesByDateWithFasting(entries, fastingDaySet);
	return averageTotals(dailyTotals);
};

export const getMonthlyStats = async (userId: string) => {
	const endDate = today();
	const startDate = shiftDate(endDate, -29);
	const [entries, fastingDaySet] = await Promise.all([
		listEntriesByDateRange(userId, startDate, endDate),
		getFastingDays(userId, startDate, endDate)
	]);
	const dailyTotals = groupEntriesByDateWithFasting(entries, fastingDaySet);
	return averageTotals(dailyTotals);
};

export const getMealBreakdown = async (
	userId: string,
	startDate: string,
	endDate: string
): Promise<Array<{ mealType: string } & MacroTotals>> => {
	const entries = await listEntriesByDateRange(userId, startDate, endDate);
	const groups: Record<string, MacroTotals> = {};
	for (const entry of entries) {
		const key = entry.mealType;
		if (!groups[key]) groups[key] = emptyTotals();
		groups[key] = addTotals(groups[key], calculateEntryMacros(entry));
	}
	const order = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
	return Object.entries(groups)
		.map(([mealType, totals]) => ({ mealType, ...roundTotals(totals) }))
		.sort((a, b) => {
			const ai = order.indexOf(a.mealType);
			const bi = order.indexOf(b.mealType);
			if (ai !== -1 && bi !== -1) return ai - bi;
			if (ai !== -1) return -1;
			if (bi !== -1) return 1;
			return a.mealType.localeCompare(b.mealType);
		});
};

export const getCalendarStats = async (
	userId: string,
	year: number,
	month: number
): Promise<CalendarStats> => {
	const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
	const lastDay = new Date(year, month + 1, 0).getDate();
	const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
	const entries = await listEntriesByDateRange(userId, startDate, endDate);
	const days: Record<string, CalendarDay> = {};
	for (const entry of entries) {
		if (!days[entry.date]) {
			days[entry.date] = { calories: 0, hasEntries: true };
		}
		const macros = calculateEntryMacros(entry);
		days[entry.date].calories += macros.calories;
	}
	for (const date of Object.keys(days)) {
		days[date].calories = Math.round(days[date].calories);
	}
	return { days };
};

export const getDailyBreakdown = async (
	userId: string,
	startDate: string,
	endDate: string
): Promise<Array<{ date: string } & MacroTotals>> => {
	const entries = await listEntriesByDateRange(userId, startDate, endDate);
	const groups: Record<string, MacroTotals> = {};
	for (const entry of entries) {
		if (!groups[entry.date]) groups[entry.date] = emptyTotals();
		groups[entry.date] = addTotals(groups[entry.date], calculateEntryMacros(entry));
	}
	const result: Array<{ date: string } & MacroTotals> = [];
	const current = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');
	while (current <= end) {
		const dateStr = current.toISOString().split('T')[0];
		result.push({ date: dateStr, ...roundTotals(groups[dateStr] ?? emptyTotals()) });
		current.setUTCDate(current.getUTCDate() + 1);
	}
	return result;
};

export const getStreaks = async (userId: string) => {
	const db = getDB();
	const rows = await db
		.selectDistinct({ date: foodEntries.date })
		.from(foodEntries)
		.where(eq(foodEntries.userId, userId))
		.orderBy(sql`${foodEntries.date} desc`);

	if (rows.length === 0) {
		return { currentStreak: 0, longestStreak: 0 };
	}

	const dates = rows.map((r) => r.date);

	const todayStr = today();
	const yesterdayStr = shiftDate(todayStr, -1);

	let currentStreak = 0;
	if (dates[0] === todayStr || dates[0] === yesterdayStr) {
		let expected = dates[0] === todayStr ? todayStr : yesterdayStr;
		for (const d of dates) {
			if (d === expected) {
				currentStreak++;
				expected = shiftDate(expected, -1);
			} else if (d < expected) {
				break;
			}
		}
	}

	let longestStreak = 1;
	let run = 1;
	for (let i = 1; i < dates.length; i++) {
		if (dates[i] === shiftDate(dates[i - 1], -1)) {
			run++;
			if (run > longestStreak) longestStreak = run;
		} else {
			run = 1;
		}
	}

	return { currentStreak, longestStreak };
};

export const getTopFoods = async (
	userId: string,
	days: number,
	limit: number
): Promise<
	Array<{
		foodId: string | null;
		recipeId: string | null;
		foodName: string;
		count: number;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	}>
> => {
	const endDate = today();
	const startDate = shiftDate(endDate, -(days - 1));
	const entries = await listEntriesByDateRange(userId, startDate, endDate);

	const groups: Record<
		string,
		{
			foodName: string;
			foodId: string | null;
			recipeId: string | null;
			count: number;
			totalMacros: MacroTotals;
		}
	> = {};
	for (const entry of entries) {
		const key = entry.foodId ?? `recipe:${entry.recipeId}`;
		if (!groups[key]) {
			groups[key] = {
				foodName: entry.foodName ?? 'Unknown',
				foodId: entry.foodId,
				recipeId: entry.recipeId,
				count: 0,
				totalMacros: emptyTotals()
			};
		}
		groups[key].count++;
		groups[key].totalMacros = addTotals(groups[key].totalMacros, calculateEntryMacros(entry));
	}

	return Object.values(groups)
		.sort((a, b) => b.count - a.count)
		.slice(0, limit)
		.map((g) => ({
			foodId: g.foodId,
			recipeId: g.recipeId,
			foodName: g.foodName,
			count: g.count,
			...roundTotals(scaleTotals(g.totalMacros, 1 / g.count))
		}));
};
