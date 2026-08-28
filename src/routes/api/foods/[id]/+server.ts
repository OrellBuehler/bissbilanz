import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteFood, getFood, updateFood } from '$lib/server/foods';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { isStaleDelete, respondUpdate, staleConflict } from '$lib/server/sync/conflict';
import { foods } from '$lib/server/schema';

export const GET: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const food = await getFood(userId, id);
	if (!food) {
		return notFound('Food');
	}
	return json({ food });
});

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const food = unwrapResult(await updateFood(userId, id, body, clientEditedAt));
		return respondUpdate({ key: 'food', updated: food, clientEditedAt, resourceName: 'Food' });
	}
);

export const DELETE: RequestHandler = withAuthedResource(
	async ({ userId, id, clientEditedAt, url }) => {
		// A delete queued offline must not destroy a newer server-side edit.
		if (await isStaleDelete(foods, id, userId, clientEditedAt)) {
			return staleConflict();
		}
		const force = url.searchParams.get('force') === 'true';
		const result = await deleteFood(userId, id, force);
		if (result.blocked) {
			return json({ error: 'has_entries', entryCount: result.entryCount }, { status: 409 });
		}
		return new Response(null, { status: 204 });
	}
);
