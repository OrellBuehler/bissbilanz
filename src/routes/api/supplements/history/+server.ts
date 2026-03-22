import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLogsForRange } from '$lib/server/supplements';
import { handleApiError, requireAuth, requireDate } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const from = requireDate(url.searchParams.get('from'), 'from');
		const to = requireDate(url.searchParams.get('to'), 'to');

		const history = await getLogsForRange(userId, from, to);
		return json({ history });
	} catch (error) {
		return handleApiError(error);
	}
};
