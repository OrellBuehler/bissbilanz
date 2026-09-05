import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWeightEntries, getWeightWithTrend, createWeightEntry } from '$lib/server/weight';
import {
	handleApiError,
	requireAuth,
	requireDate,
	unwrapResult,
	parseJsonBody
} from '$lib/server/errors';
import { readClientEditedAt } from '$lib/server/sync/headers';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');

		if (from && to) {
			const fromDate = requireDate(from, 'from');
			const toDate = requireDate(to, 'to');
			const data = await getWeightWithTrend(userId, fromDate, toDate);
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
		const entry = unwrapResult(await createWeightEntry(userId, body, readClientEditedAt(request)));
		return json({ entry }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
