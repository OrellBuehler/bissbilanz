import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { copyEntries } from '$lib/server/entries';
import { handleApiError, requireAuth, requireDate } from '$lib/server/errors';

export const POST: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const fromDate = requireDate(url.searchParams.get('fromDate'), 'fromDate');
		const toDate = requireDate(url.searchParams.get('toDate'), 'toDate');

		const entries = await copyEntries(userId, fromDate, toDate);
		return json({ entries, count: entries.length });
	} catch (error) {
		return handleApiError(error);
	}
};
