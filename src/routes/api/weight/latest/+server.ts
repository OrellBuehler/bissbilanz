import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLatestWeight } from '$lib/server/weight';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const entry = await getLatestWeight(userId);
		return json({ entry });
	} catch (error) {
		return handleApiError(error);
	}
};
