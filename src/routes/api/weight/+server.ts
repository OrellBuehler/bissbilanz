import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWeightEntries, getWeightWithTrend, createWeightEntry } from '$lib/server/weight';
import { handleApiError, requireAuth, unwrapResult, parseJsonBody } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');

		if (from && to) {
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(from) || !dateRegex.test(to)) {
				return json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400 });
			}
			const data = await getWeightWithTrend(userId, from, to);
			return json({ data });
		}

		const entries = await getWeightEntries(userId);
		return json({ entries });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		const entry = unwrapResult(await createWeightEntry(userId, body));
		return json({ entry }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
