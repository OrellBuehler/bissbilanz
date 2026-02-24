import { listEntriesByDateRange } from '$lib/server/entries';
import { averageTotals } from '$lib/utils/stats';
import {
	emptyTotals,
	addTotals,
	calculateEntryMacros,
	roundTotals,
	type MacroTotals
} from '$lib/utils/nutrition';
import { getDB, foodEntries } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const formatDate = (date: Date) => date.toISOString().split('T')[0];

const getDaysAgo = (days: number) => {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return formatDate(date);
};

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

export const getWeeklyStats = async (userId: string) => {
	const endDate = formatDate(new Date());
	const startDate = getDaysAgo(6);
	const entries = await listEntriesByDateRange(userId, startDate, endDate);
	const dailyTotals = groupEntriesByDate(entries);
	return averageTotals(dailyTotals);
};

export const getMonthlyStats = async (userId: string) => {
	const endDate = formatDate(new Date());
	const startDate = getDaysAgo(29);
	const entries = await listEntriesByDateRange(userId, startDate, endDate);
	const dailyTotals = groupEntriesByDate(entries);
	return averageTotals(dailyTotals);
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
		return { currentStreak: 0, longestStreak: 0, lastLoggedDate: null };
	}

	const dates = rows.map((r) => r.date);
	const lastLoggedDate = dates[0];

	const todayStr = formatDate(new Date());
	const yesterdayStr = getDaysAgo(1);

	let currentStreak = 0;
	if (dates[0] === todayStr || dates[0] === yesterdayStr) {
		let expected = dates[0] === todayStr ? todayStr : yesterdayStr;
		for (const d of dates) {
			if (d === expected) {
				currentStreak++;
				const prev = new Date(expected + 'T00:00:00Z');
				prev.setUTCDate(prev.getUTCDate() - 1);
				expected = prev.toISOString().split('T')[0];
			} else if (d < expected) {
				break;
			}
		}
	}

	let longestStreak = 1;
	let run = 1;
	for (let i = 1; i < dates.length; i++) {
		const prev = new Date(dates[i - 1] + 'T00:00:00Z');
		prev.setUTCDate(prev.getUTCDate() - 1);
		if (dates[i] === prev.toISOString().split('T')[0]) {
			run++;
			if (run > longestStreak) longestStreak = run;
		} else {
			run = 1;
		}
	}

	return { currentStreak, longestStreak, lastLoggedDate };
};
