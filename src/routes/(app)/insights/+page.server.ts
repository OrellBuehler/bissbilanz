import type { PageServerLoad } from './$types';
import {
	getDailyBreakdown,
	getMealBreakdown,
	getTopFoods,
	getStreaks,
	computeCalendarDays,
	markFastDays,
	listFastsTouchingRange
} from '$lib/server/stats';
import { listEntriesByDateRange } from '$lib/server/entries';
import { getGoals } from '$lib/server/goals';
import { getWeightWithTrend } from '$lib/server/weight';
import { todayInTimeZone, shiftDate } from '$lib/utils/dates';
import { getUserTimeZone, getPreferences, DEFAULT_PREFERENCES } from '$lib/server/preferences';
import { getDayPropertiesRange } from '$lib/server/day-properties';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const endDate = todayInTimeZone(await getUserTimeZone(userId));
	const start7 = shiftDate(endDate, -6);
	const start28 = shiftDate(endDate, -27);
	// Calendar month follows the user's local "today" (derived from endDate).
	const [year, monthNum] = endDate.split('-').map(Number);
	const month = monthNum - 1;
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
		calendarRangeEntries,
		calendarRangeFasts,
		timeZone,
		dayProps,
		preferences
	] = await Promise.all([
		getDailyBreakdown(userId, start7, endDate),
		getGoals(userId),
		getMealBreakdown(userId, endDate, endDate),
		getTopFoods(userId, 7, 10),
		getWeightWithTrend(userId, shiftDate(endDate, -29), endDate),
		getStreaks(userId),
		listEntriesByDateRange(userId, calendarRangeStart, calendarRangeEnd),
		listFastsTouchingRange(userId, calendarRangeStart, calendarRangeEnd),
		getUserTimeZone(userId),
		getDayPropertiesRange(userId, start7, endDate),
		getPreferences(userId)
	]);

	const allCalendarDays = markFastDays(
		computeCalendarDays(calendarRangeEntries),
		calendarRangeFasts,
		timeZone
	);
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

	const activityByDate = new Map(dayProps.map((p) => [p.date, p.activityCalories]));
	const dailyDataWithActivity = dailyData.map((day) => ({
		...day,
		activityCalories: activityByDate.get(day.date) ?? null
	}));

	return {
		dailyStatus: {
			data: dailyDataWithActivity,
			goals: goalsData,
			activityGoalAdjustment:
				preferences?.activityGoalAdjustment ?? DEFAULT_PREFERENCES.activityGoalAdjustment,
			activityCreditPercent:
				preferences?.activityCreditPercent ?? DEFAULT_PREFERENCES.activityCreditPercent
		},
		calendarDays,
		streakDays,
		mealBreakdown,
		topFoods,
		initialChartData,
		streaks
	};
};
