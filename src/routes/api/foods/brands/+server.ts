import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFoodBrands } from '$lib/server/foods';
import { handleApiError, requireAuth } from '$lib/server/errors';

/** Distinct brands of the user's foods with per-brand food counts. */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		return json({ brands: await listFoodBrands(userId) });
	} catch (error) {
		return handleApiError(error);
	}
};
