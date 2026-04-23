import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listEntriesByDateRange } from '$lib/server/entries';
import { handleApiError, requireAuth, requireDate, ApiError } from '$lib/server/errors';

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

		const entries = await listEntriesByDateRange(userId, start, end);
		return json({ entries });
	} catch (error) {
		return handleApiError(error);
	}
};
