import { listEntriesByDateRange } from '$lib/server/entries';
import { averageTotals } from '$lib/utils/stats';
import {
	emptyTotals,
	addTotals,
	calculateEntryMacros,
	roundTotals,
	type MacroTotals
} from '$lib/utils/nutrition';

export type CalendarDay = { calories: number; hasEntries: boolean };
export type CalendarStats = { days: Record<string, CalendarDay> };

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
	const endDate = formatDate(new Date());
	const startDate = getDaysAgo(days - 1);
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
			...roundTotals({
				calories: g.totalMacros.calories / g.count,
				protein: g.totalMacros.protein / g.count,
				carbs: g.totalMacros.carbs / g.count,
				fat: g.totalMacros.fat / g.count,
				fiber: g.totalMacros.fiber / g.count
			})
		}));
};
