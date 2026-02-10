import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMonthlyStats } from '$lib/server/stats';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const stats = await getMonthlyStats(userId);
		return json({ stats });
	} catch (error) {
		return handleApiError(error);
	}
};
