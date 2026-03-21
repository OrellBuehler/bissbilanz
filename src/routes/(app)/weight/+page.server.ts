import type { PageServerLoad } from './$types';
import { getWeightWithTrend } from '$lib/server/weight';
import { daysAgo, today } from '$lib/utils/dates';

type ChartPoint = { entry_date: string; weight_kg: number; moving_avg: number | null };

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const from = daysAgo(30);
	const to = today();
	const initialChartData = (await getWeightWithTrend(userId, from, to)) as ChartPoint[];
	return { initialChartData };
};
