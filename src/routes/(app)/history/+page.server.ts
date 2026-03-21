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

	const rangeStart = calendarStart < start30 ? calendarStart : start30;
	const rangeEnd = calendarEnd > endDate ? calendarEnd : endDate;

	const [allEntries, fastingDays, goals] = await Promise.all([
		listEntriesByDateRange(userId, rangeStart, rangeEnd),
		getFastingDays(userId, start30, endDate),
		getGoals(userId)
	]);

	const entries30 = allEntries.filter((e) => e.date >= start30 && e.date <= endDate);
	const entries7 = allEntries.filter((e) => e.date >= start7 && e.date <= endDate);
	const calendarEntries = allEntries.filter(
		(e) => e.date >= calendarStart && e.date <= calendarEnd
	);
	const fastingDays7 = new Set([...fastingDays].filter((d) => d >= start7));

	return {
		weeklyStats: computeAverages(entries7, fastingDays7),
		monthlyStats: computeAverages(entries30, fastingDays),
		chartData: computeDailyBreakdown(entries7, start7, endDate),
		calendarDays: computeCalendarDays(calendarEntries),
		calorieGoal: goals?.calorieGoal ?? null
	};
};
