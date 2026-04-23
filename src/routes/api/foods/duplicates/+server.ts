import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findDuplicateGroups } from '$lib/server/food-duplicates';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const groups = await findDuplicateGroups(userId);
		return json({ groups });
	} catch (error) {
		return handleApiError(error);
	}
};
