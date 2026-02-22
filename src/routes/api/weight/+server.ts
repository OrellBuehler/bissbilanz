import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWeightEntries, getWeightWithTrend, createWeightEntry } from '$lib/server/weight';
import { handleApiError, requireAuth, isZodError, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');

		if (from && to) {
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
		const body = await request.json();
		const result = await createWeightEntry(userId, body);

		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		return json({ entry: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
