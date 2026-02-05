import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWeeklyStats } from '$lib/server/stats';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const stats = await getWeeklyStats(locals.user.id);
	return json({ stats });
};
