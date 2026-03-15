import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEntry, listEntriesByDate } from '$lib/server/entries';
import { paginationSchema } from '$lib/server/validation';
import {
	handleApiError,
	requireAuth,
	unwrapResult,
	validationError,
	parseJsonBody
} from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const date = url.searchParams.get('date');
		if (!date) {
			return json({ error: 'Missing date parameter' }, { status: 400 });
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400 });
		}

		const paginationResult = paginationSchema.safeParse({
			limit: url.searchParams.get('limit'),
			offset: url.searchParams.get('offset')
		});

		if (!paginationResult.success) {
			return validationError(paginationResult.error);
		}

		const { limit, offset } = paginationResult.data;
		const { items: entries, total } = await listEntriesByDate(userId, date, { limit, offset });
		return json({ entries, total });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);

		const entry = unwrapResult(await createEntry(userId, body));
		return json({ entry }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
