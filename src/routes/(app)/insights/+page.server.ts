import type { PageServerLoad } from './$types';
import {
	getDailyBreakdown,
	getMealBreakdown,
	getTopFoods,
	getStreaks,
	computeCalendarDays
} from '$lib/server/stats';
import { listEntriesByDateRange } from '$lib/server/entries';
import { getGoals } from '$lib/server/goals';
import { getWeightWithTrend } from '$lib/server/weight';
import { today, shiftDate, daysAgo } from '$lib/utils/dates';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const endDate = today();
	const start7 = shiftDate(endDate, -6);
	const start28 = shiftDate(endDate, -27);
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth();
	const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
	const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
	const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
	const calendarRangeStart = start28 < monthStart ? start28 : monthStart;
	const calendarRangeEnd = endDate > monthEnd ? endDate : monthEnd;

	const [
		dailyData,
		goals,
		mealBreakdown,
		topFoods,
		initialChartData,
		streaks,
		calendarRangeEntries
	] = await Promise.all([
		getDailyBreakdown(userId, start7, endDate),
		getGoals(userId),
		getMealBreakdown(userId, endDate, endDate),
		getTopFoods(userId, 7, 10),
		getWeightWithTrend(userId, daysAgo(30), endDate),
		getStreaks(userId),
		listEntriesByDateRange(userId, calendarRangeStart, calendarRangeEnd)
	]);

	const allCalendarDays = computeCalendarDays(calendarRangeEntries);
	const calendarDays: typeof allCalendarDays = {};
	const streakDays: typeof allCalendarDays = {};
	for (const [date, day] of Object.entries(allCalendarDays)) {
		if (date >= monthStart && date <= monthEnd) calendarDays[date] = day;
		if (date >= start28 && date <= endDate) streakDays[date] = day;
	}

	const goalsData = goals
		? {
				calorieGoal: goals.calorieGoal,
				proteinGoal: goals.proteinGoal,
				carbGoal: goals.carbGoal,
				fatGoal: goals.fatGoal,
				fiberGoal: goals.fiberGoal
			}
		: null;

	return {
		dailyStatus: { data: dailyData, goals: goalsData },
		calendarDays,
		streakDays,
		mealBreakdown,
		topFoods,
		initialChartData,
		streaks
	};
};
