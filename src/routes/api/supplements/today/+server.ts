import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupplementChecklist } from '$lib/server/supplements';
import { today } from '$lib/utils/dates';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const date = today();
		const checklist = await getSupplementChecklist(userId, date);
		return json({ checklist, date });
	} catch (error) {
		return handleApiError(error);
	}
};
