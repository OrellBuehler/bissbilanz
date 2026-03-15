import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listEntriesByDateRange } from '$lib/server/entries';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');

		if (!startDate || !endDate) {
			return json({ error: 'startDate and endDate parameters are required' }, { status: 400 });
		}
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
			return json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400 });
		}

		const entries = await listEntriesByDateRange(userId, startDate, endDate);
		return json({ entries });
	} catch (error) {
		return handleApiError(error);
	}
};
