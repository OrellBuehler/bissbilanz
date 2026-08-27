import type { RequestHandler } from './$types';
import { updateWeightEntry, deleteWeightEntry } from '$lib/server/weight';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { isStaleDelete, respondUpdate, staleConflict } from '$lib/server/sync/conflict';
import { weightEntries } from '$lib/server/schema';

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const entry = unwrapResult(await updateWeightEntry(userId, id, body, clientEditedAt));
		return respondUpdate({
			key: 'entry',
			updated: entry,
			clientEditedAt,
			resourceName: 'Weight entry'
		});
	}
);

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id, clientEditedAt }) => {
	// A delete queued offline must not destroy a newer server-side edit.
	if (await isStaleDelete(weightEntries, id, userId, clientEditedAt)) {
		return staleConflict();
	}
	const deleted = await deleteWeightEntry(userId, id);

	if (!deleted) {
		return notFound('Weight entry');
	}

	return new Response(null, { status: 204 });
});
