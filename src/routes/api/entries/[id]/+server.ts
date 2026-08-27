import type { RequestHandler } from './$types';
import { deleteEntry, updateEntry } from '$lib/server/entries';
import { unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { isStaleDelete, respondUpdate, staleConflict } from '$lib/server/sync/conflict';
import { foodEntries } from '$lib/server/schema';

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const entry = unwrapResult(await updateEntry(userId, id, body, clientEditedAt));
		return respondUpdate({ key: 'entry', updated: entry, clientEditedAt, resourceName: 'Entry' });
	}
);

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id, clientEditedAt }) => {
	// A delete queued offline must not destroy a newer server-side edit.
	if (await isStaleDelete(foodEntries, id, userId, clientEditedAt)) {
		return staleConflict();
	}
	await deleteEntry(userId, id);
	return new Response(null, { status: 204 });
});
