import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLogsForRange } from '$lib/server/supplements';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');

		if (!from || !to) {
			return json({ error: 'from and to query parameters are required' }, { status: 400 });
		}

		const history = await getLogsForRange(userId, from, to);
		return json({ history });
	} catch (error) {
		return handleApiError(error);
	}
};
