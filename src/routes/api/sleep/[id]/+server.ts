import type { RequestHandler } from './$types';
import { updateSleepEntry, deleteSleepEntry } from '$lib/server/sleep';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { respondUpdate } from '$lib/server/sync/conflict';

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const entry = unwrapResult(await updateSleepEntry(userId, id, body, clientEditedAt));
		return respondUpdate({
			key: 'entry',
			updated: entry,
			clientEditedAt,
			resourceName: 'Sleep entry'
		});
	}
);

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const deleted = await deleteSleepEntry(userId, id);

	if (!deleted) {
		return notFound('Sleep entry');
	}

	return new Response(null, { status: 204 });
});
