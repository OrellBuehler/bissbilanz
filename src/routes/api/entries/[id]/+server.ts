import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteEntry, updateEntry } from '$lib/server/entries';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';

export const PATCH: RequestHandler = withAuthedResource(async ({ userId, id, request }) => {
	const body = await parseJsonBody(request);
	const entry = unwrapResult(await updateEntry(userId, id, body));
	if (!entry) {
		return notFound('Entry');
	}
	return json({ entry });
});

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	await deleteEntry(userId, id);
	return new Response(null, { status: 204 });
});
