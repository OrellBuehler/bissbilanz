import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateWeightEntry, deleteWeightEntry } from '$lib/server/weight';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';

export const PATCH: RequestHandler = withAuthedResource(async ({ userId, id, request }) => {
	const body = await parseJsonBody(request);
	const entry = unwrapResult(await updateWeightEntry(userId, id, body));
	if (!entry) {
		return notFound('Weight entry');
	}
	return json({ entry });
});

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const deleted = await deleteWeightEntry(userId, id);

	if (!deleted) {
		return notFound('Weight entry');
	}

	return new Response(null, { status: 204 });
});
