import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFoodIds } from '$lib/server/foods';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		return json({ ids: await listFoodIds(userId) });
	} catch (error) {
		return handleApiError(error);
	}
};
