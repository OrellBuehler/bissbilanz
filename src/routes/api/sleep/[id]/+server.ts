import type { RequestHandler } from './$types';
import { updateSleepEntry, deleteSleepEntry } from '$lib/server/sleep';
import {
	handleApiError,
	notFound,
	requireAuth,
	requireUuid,
	unwrapResult,
	parseJsonBody
} from '$lib/server/errors';
import { respondUpdate } from '$lib/server/sync/conflict';
import { readClientEditedAt } from '$lib/server/sync/headers';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		const id = requireUuid(params.id);
		const clientEditedAt = readClientEditedAt(request);
		const entry = unwrapResult(await updateSleepEntry(userId, id, body, clientEditedAt));
		return respondUpdate({
			key: 'entry',
			updated: entry,
			clientEditedAt,
			resourceName: 'Sleep entry'
		});
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const id = requireUuid(params.id);
		const deleted = await deleteSleepEntry(userId, id);

		if (!deleted) {
			return notFound('Sleep entry');
		}

		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
