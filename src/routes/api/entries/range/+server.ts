import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listEntriesByDateRange } from '$lib/server/entries';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const startDate = url.searchParams.get('startDate');
	const endDate = url.searchParams.get('endDate');
	if (!startDate || !endDate) {
		return json({ error: 'startDate and endDate required' }, { status: 400 });
	}
	const entries = await listEntriesByDateRange(locals.user.id, startDate, endDate);
	return json({ entries });
};
