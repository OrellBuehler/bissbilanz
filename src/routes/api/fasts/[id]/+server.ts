import type { RequestHandler } from './$types';
import { updateFastingSession, deleteFastingSession } from '$lib/server/fasting';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { isStaleDelete, respondUpdate, staleConflict } from '$lib/server/sync/conflict';
import { fastingSessions } from '$lib/server/schema';

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const session = unwrapResult(await updateFastingSession(userId, id, body, clientEditedAt));
		return respondUpdate({
			key: 'session',
			updated: session,
			clientEditedAt,
			resourceName: 'Fasting session'
		});
	}
);

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id, clientEditedAt }) => {
	if (await isStaleDelete(fastingSessions, id, userId, clientEditedAt)) {
		return staleConflict();
	}
	const deleted = await deleteFastingSession(userId, id);
	if (!deleted) {
		return notFound('Fasting session');
	}
	return new Response(null, { status: 204 });
});
