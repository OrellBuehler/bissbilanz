import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listEntriesByDateRangeDetailed } from '$lib/server/entries';
import { handleApiError, requireAuth, requireDate, ApiError } from '$lib/server/errors';
import { daysBetween } from '$lib/utils/dates';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');

		if (!startDate || !endDate) {
			throw new ApiError(400, 'startDate and endDate parameters are required');
		}
		const start = requireDate(startDate, 'startDate');
		const end = requireDate(endDate, 'endDate');

		// Bound the span (consistent with analytics) — this endpoint has no
		// pagination, so an unbounded range could scan/return all of a user's data.
		const span = daysBetween(start, end);
		if (span < 0) {
			throw new ApiError(400, 'endDate must be on or after startDate');
		}
		if (span > 366) {
			throw new ApiError(400, 'Date range must not exceed 366 days');
		}

		const entries = await listEntriesByDateRangeDetailed(userId, start, end);
		return json({ entries });
	} catch (error) {
		return handleApiError(error);
	}
};
