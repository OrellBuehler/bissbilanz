import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupplementChecklist } from '$lib/server/supplements';
import { todayInTimeZone } from '$lib/utils/dates';
import { getUserTimeZone } from '$lib/server/preferences';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const date = todayInTimeZone(await getUserTimeZone(userId));
		const checklist = await getSupplementChecklist(userId, date);
		return json({ checklist, date });
	} catch (error) {
		return handleApiError(error);
	}
};
