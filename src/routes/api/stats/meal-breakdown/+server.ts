import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMealBreakdown } from '$lib/server/stats';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const date = url.searchParams.get('date');
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');

		let start: string, end: string;
		if (date) {
			start = end = date;
		} else if (startDate && endDate) {
			start = startDate;
			end = endDate;
		} else {
			return json({ error: 'date or startDate+endDate required' }, { status: 400 });
		}

		const data = await getMealBreakdown(userId, start, end);
		return json({ data });
	} catch (error) {
		return handleApiError(error);
	}
};
