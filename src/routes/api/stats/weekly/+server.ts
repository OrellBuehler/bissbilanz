import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWeeklyStats } from '$lib/server/stats';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const stats = await getWeeklyStats(userId);
		return json({ stats });
	} catch (error) {
		return handleApiError(error);
	}
};
