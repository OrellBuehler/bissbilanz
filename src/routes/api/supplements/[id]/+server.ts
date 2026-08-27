import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupplementById, updateSupplement, deleteSupplement } from '$lib/server/supplements';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { isStaleDelete, respondUpdate, staleConflict } from '$lib/server/sync/conflict';
import { supplements } from '$lib/server/schema';

export const GET: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const supplement = await getSupplementById(userId, id);
	if (!supplement) {
		return notFound('Supplement');
	}
	return json({ supplement });
});

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const supplement = unwrapResult(await updateSupplement(userId, id, body, clientEditedAt));
		return respondUpdate({
			key: 'supplement',
			updated: supplement,
			clientEditedAt,
			resourceName: 'Supplement'
		});
	}
);

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id, clientEditedAt }) => {
	// A delete queued offline must not destroy a newer server-side edit.
	if (await isStaleDelete(supplements, id, userId, clientEditedAt)) {
		return staleConflict();
	}
	await deleteSupplement(userId, id);
	return new Response(null, { status: 204 });
});
