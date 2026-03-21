import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listRecentFoods } from '$lib/server/foods';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const foods = await listRecentFoods(userId);
		return json({ foods });
	} catch (error) {
		return handleApiError(error);
	}
};
