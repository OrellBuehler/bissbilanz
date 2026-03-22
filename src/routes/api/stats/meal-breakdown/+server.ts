import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMealBreakdown } from '$lib/server/stats';
import { handleApiError, requireAuth, requireDate } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const dateParam = url.searchParams.get('date');
		const startDateParam = url.searchParams.get('startDate');
		const endDateParam = url.searchParams.get('endDate');

		let start: string, end: string;
		if (dateParam) {
			start = end = requireDate(dateParam, 'date');
		} else if (startDateParam && endDateParam) {
			start = requireDate(startDateParam, 'startDate');
			end = requireDate(endDateParam, 'endDate');
		} else {
			return json({ error: 'date or startDate+endDate required' }, { status: 400 });
		}

		const data = await getMealBreakdown(userId, start, end);
		return json({ data });
	} catch (error) {
		return handleApiError(error);
	}
};
