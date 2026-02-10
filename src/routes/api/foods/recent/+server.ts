import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listRecentFoods } from '$lib/server/foods';
import { uniqueById } from '$lib/utils/recents';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const recentFoods = await listRecentFoods(userId);
		const foods = uniqueById(recentFoods);
		return json({ foods });
	} catch (error) {
		return handleApiError(error);
	}
};
