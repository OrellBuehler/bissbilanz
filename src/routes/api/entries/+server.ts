import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEntry, listEntriesByDate } from '$lib/server/entries';
import { paginationSchema } from '$lib/server/validation';
import { handleApiError, isZodError, requireAuth, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const date = url.searchParams.get('date');
		if (!date) {
			return json({ error: 'Missing date parameter' }, { status: 400 });
		}

		const paginationResult = paginationSchema.safeParse({
			limit: url.searchParams.get('limit'),
			offset: url.searchParams.get('offset')
		});

		if (!paginationResult.success) {
			return validationError(paginationResult.error);
		}

		const { limit, offset } = paginationResult.data;
		const entries = await listEntriesByDate(userId, date, { limit, offset });
		return json({ entries });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();

		const result = await createEntry(userId, body);
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
