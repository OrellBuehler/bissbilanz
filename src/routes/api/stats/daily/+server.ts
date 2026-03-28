import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDailyBreakdown } from '$lib/server/stats';
import { getGoals } from '$lib/server/goals';
import { handleApiError, requireAuth, requireDate } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const startDate = requireDate(url.searchParams.get('startDate'), 'startDate');
		const endDate = requireDate(url.searchParams.get('endDate'), 'endDate');
		const [data, goals] = await Promise.all([
			getDailyBreakdown(userId, startDate, endDate),
			getGoals(userId)
		]);
		return json({
			data,
			goals: goals
				? {
						calorieGoal: goals.calorieGoal,
						proteinGoal: goals.proteinGoal,
						carbGoal: goals.carbGoal,
						fatGoal: goals.fatGoal,
						fiberGoal: goals.fiberGoal
					}
				: null
		});
	} catch (error) {
		return handleApiError(error);
	}
};
