import type { PageServerLoad } from './$types';
import { listEntriesByDateRange } from '$lib/server/entries';
import { getFastingDays } from '$lib/server/day-properties';
import { getGoals } from '$lib/server/goals';
import { computeAverages, computeDailyBreakdown, computeCalendarDays } from '$lib/server/stats';
import { today, shiftDate } from '$lib/utils/dates';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const endDate = today();
	const start30 = shiftDate(endDate, -29);
	const start7 = shiftDate(endDate, -6);

	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth();
	const calendarStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
	const lastDay = new Date(year, month + 1, 0).getDate();
	const calendarEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

	const needsSeparateCalendar = calendarStart < start30 || calendarEnd > endDate;

	const [entries30, fastingDays, goals, calendarEntries] = await Promise.all([
		listEntriesByDateRange(userId, start30, endDate),
		getFastingDays(userId, start30, endDate),
		getGoals(userId),
		needsSeparateCalendar ? listEntriesByDateRange(userId, calendarStart, calendarEnd) : null
	]);

	const entries7 = entries30.filter((e) => e.date >= start7);

	return {
		weeklyStats: computeAverages(entries7, fastingDays),
		monthlyStats: computeAverages(entries30, fastingDays),
		chartData: computeDailyBreakdown(entries7, start7, endDate),
		calendarDays: computeCalendarDays(calendarEntries ?? entries30),
		calorieGoal: goals?.calorieGoal ?? null
	};
};
