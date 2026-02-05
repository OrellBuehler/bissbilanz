import { listEntriesByDateRange } from '$lib/server/entries';
import { averageTotals } from '$lib/utils/stats';
import { emptyTotals, addTotals, calculateEntryMacros, type MacroTotals } from '$lib/utils/nutrition';

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
