import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDailyBreakdown } from '$lib/server/stats';
import { getGoals } from '$lib/server/goals';
import { handleApiError, requireAuth, ApiError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');
		if (!startDate || !endDate) {
			throw new ApiError(400, 'Start date and end date required');
		}
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
