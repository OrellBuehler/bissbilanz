import { listEntriesByDateRange } from '$lib/server/entries';
import { averageTotals } from '$lib/utils/stats';

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
) => {
	const groups: Record<
		string,
		{ calories: number; protein: number; carbs: number; fat: number; fiber: number }
	> = {};
	for (const entry of entries) {
		if (!groups[entry.date]) {
			groups[entry.date] = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
		}
		groups[entry.date].calories += (entry.calories ?? 0) * entry.servings;
		groups[entry.date].protein += (entry.protein ?? 0) * entry.servings;
		groups[entry.date].carbs += (entry.carbs ?? 0) * entry.servings;
		groups[entry.date].fat += (entry.fat ?? 0) * entry.servings;
		groups[entry.date].fiber += (entry.fiber ?? 0) * entry.servings;
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
