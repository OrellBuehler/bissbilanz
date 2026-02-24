import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCalendarStats } from '$lib/server/stats';
import { handleApiError, requireAuth, ApiError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const monthParam = url.searchParams.get('month');
		if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
			throw new ApiError(400, 'month parameter required (format: YYYY-MM)');
		}
		const [yearStr, monthStr] = monthParam.split('-');
		const year = parseInt(yearStr, 10);
		const month = parseInt(monthStr, 10) - 1;
		if (month < 0 || month > 11) {
			throw new ApiError(400, 'Invalid month');
		}
		const data = await getCalendarStats(userId, year, month);
		return json(data);
	} catch (error) {
		return handleApiError(error);
	}
};
