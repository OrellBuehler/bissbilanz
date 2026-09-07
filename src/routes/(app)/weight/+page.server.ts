import type { PageServerLoad } from './$types';
import { getWeightWithTrend } from '$lib/server/weight';
import { getGoals } from '$lib/server/goals';
import { todayInTimeZone, shiftDate } from '$lib/utils/dates';
import { getUserTimeZone } from '$lib/server/preferences';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const endDate = todayInTimeZone(await getUserTimeZone(userId));

	const [initialChartData, goals] = await Promise.all([
		getWeightWithTrend(userId, shiftDate(endDate, -29), endDate),
		getGoals(userId)
	]);

	return {
		endDate,
		initialChartData,
		target: goals
			? { targetWeightKg: goals.targetWeightKg, targetDate: goals.targetDate }
			: { targetWeightKg: null, targetDate: null }
	};
};
