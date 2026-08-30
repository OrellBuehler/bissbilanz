import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { shiftDate, todayInTimeZone } from '$lib/utils/dates';
import { MIN_NUTRIENT_COVERAGE } from '$lib/analytics/constants.generated';
import { handleApiError, requireAuth } from '$lib/server/errors';
import { getBiologicalSex, getRdaNutrientEntries } from '$lib/server/nutrient-insights';
import { buildNutrientGapReport } from '$lib/server/nutrient-gaps';
import { getGoals } from '$lib/server/goals';
import { getUserTimeZone } from '$lib/server/preferences';
import { parseNutrientGapsParams } from '$lib/server/validation/analytics';

const DEFAULT_WINDOW_DAYS = 30;

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const params = parseNutrientGapsParams(url);
		const endDate = params.endDate ?? todayInTimeZone(await getUserTimeZone(userId));
		const startDate = params.startDate ?? shiftDate(endDate, -(DEFAULT_WINDOW_DAYS - 1));

		const [entries, goals, prefSex] = await Promise.all([
			getRdaNutrientEntries(userId, startDate, endDate),
			getGoals(userId),
			getBiologicalSex(userId)
		]);
		const sex = params.biologicalSex ?? prefSex;

		const report = buildNutrientGapReport({
			entries,
			sex,
			goals,
			minCoverage: params.minCoverage ?? MIN_NUTRIENT_COVERAGE,
			topContributors: 3,
			window: { startDate, endDate }
		});

		return json({
			...report,
			biologicalSexSource: params.biologicalSex ? 'argument' : prefSex ? 'preference' : 'unknown'
		});
	} catch (error) {
		return handleApiError(error);
	}
};
