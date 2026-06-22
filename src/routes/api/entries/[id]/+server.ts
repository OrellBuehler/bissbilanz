import type { RequestHandler } from './$types';
import { deleteEntry, updateEntry } from '$lib/server/entries';
import { unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { respondUpdate } from '$lib/server/sync/conflict';

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const entry = unwrapResult(await updateEntry(userId, id, body, clientEditedAt));
		return respondUpdate({ key: 'entry', updated: entry, clientEditedAt, resourceName: 'Entry' });
	}
);

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	await deleteEntry(userId, id);
	return new Response(null, { status: 204 });
});
