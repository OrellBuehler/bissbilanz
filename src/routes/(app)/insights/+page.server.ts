import type { PageServerLoad } from './$types';
import {
	getDailyBreakdown,
	getCalendarStats,
	getMealBreakdown,
	getTopFoods
} from '$lib/server/stats';
import { getGoals } from '$lib/server/goals';
import { getWeightWithTrend } from '$lib/server/weight';
import { today, shiftDate, daysAgo } from '$lib/utils/dates';

type ChartPoint = { entry_date: string; weight_kg: number; moving_avg: number | null };

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const endDate = today();
	const start7 = shiftDate(endDate, -6);
	const now = new Date();

	const [dailyData, goals, calendarStats, mealBreakdown, topFoods, initialChartData] =
		await Promise.all([
			getDailyBreakdown(userId, start7, endDate),
			getGoals(userId),
			getCalendarStats(userId, now.getFullYear(), now.getMonth()),
			getMealBreakdown(userId, endDate, endDate),
			getTopFoods(userId, 7, 10),
			getWeightWithTrend(userId, daysAgo(30), endDate) as Promise<ChartPoint[]>
		]);

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
		calendarDays: calendarStats.days,
		mealBreakdown,
		topFoods,
		initialChartData
	};
};
