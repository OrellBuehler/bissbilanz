import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStreaks } from '$lib/server/stats';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const streaks = await getStreaks(userId);
		return json(streaks);
	} catch (error) {
		return handleApiError(error);
	}
};
