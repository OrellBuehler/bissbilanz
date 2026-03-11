import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupplementChecklist } from '$lib/server/supplements';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const date = params.date;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return json({ error: 'Invalid date format' }, { status: 400 });
		}

		const checklist = await getSupplementChecklist(userId, date);

		return json({ checklist, date });
	} catch (error) {
		return handleApiError(error);
	}
};
