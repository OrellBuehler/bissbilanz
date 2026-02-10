import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { copyEntries } from '$lib/server/entries';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const POST: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const fromDate = url.searchParams.get('fromDate');
		const toDate = url.searchParams.get('toDate');

		if (!fromDate || !toDate) {
			return json({ error: 'Missing fromDate or toDate parameters' }, { status: 400 });
		}

		const entries = await copyEntries(userId, fromDate, toDate);
		return json({ entries, count: entries.length });
	} catch (error) {
		return handleApiError(error);
	}
};
