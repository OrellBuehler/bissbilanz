import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupplementChecklist } from '$lib/server/supplements';
import { today } from '$lib/utils/dates';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		return json(await getSupplementChecklist(userId, today()));
	} catch (error) {
		return handleApiError(error);
	}
};
