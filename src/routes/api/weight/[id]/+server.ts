import type { RequestHandler } from './$types';
import { updateWeightEntry, deleteWeightEntry } from '$lib/server/weight';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { respondUpdate } from '$lib/server/sync/conflict';

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

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const deleted = await deleteWeightEntry(userId, id);

	if (!deleted) {
		return notFound('Weight entry');
	}

	return new Response(null, { status: 204 });
});
