import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDailyBreakdown } from '$lib/server/stats';
import { getDayPropertiesRange } from '$lib/server/day-properties';
import { parseAnalyticsParams } from '$lib/server/validation/analytics';
import { getGoals } from '$lib/server/goals';
import { getPreferences, DEFAULT_PREFERENCES } from '$lib/server/preferences';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const { startDate, endDate } = parseAnalyticsParams(url);
		const [breakdown, goals, dayProps, preferences] = await Promise.all([
			getDailyBreakdown(userId, startDate, endDate),
			getGoals(userId),
			getDayPropertiesRange(userId, startDate, endDate),
			getPreferences(userId)
		]);
		const activityByDate = new Map(dayProps.map((p) => [p.date, p.activityCalories]));
		const data = breakdown.map((day) => ({
			...day,
			activityCalories: activityByDate.get(day.date) ?? null
		}));
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
				: null,
			activityGoalAdjustment:
				preferences?.activityGoalAdjustment ?? DEFAULT_PREFERENCES.activityGoalAdjustment,
			activityCreditPercent:
				preferences?.activityCreditPercent ?? DEFAULT_PREFERENCES.activityCreditPercent
		});
	} catch (error) {
		return handleApiError(error);
	}
};
