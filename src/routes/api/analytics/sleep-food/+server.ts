import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSleepFoodCorrelationData } from '$lib/server/analytics';
import { handleApiError, requireAuth } from '$lib/server/errors';
import { parseAnalyticsParams } from '$lib/server/validation/analytics';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const { startDate, endDate } = parseAnalyticsParams(url);
		const data = await getSleepFoodCorrelationData(userId, startDate, endDate);
		return json({ data });
	} catch (error) {
		return handleApiError(error);
	}
};
