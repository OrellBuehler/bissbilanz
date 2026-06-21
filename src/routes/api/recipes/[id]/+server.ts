import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteRecipe, getRecipe, updateRecipe } from '$lib/server/recipes';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { respondUpdate } from '$lib/server/sync/conflict';

export const GET: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const recipe = await getRecipe(userId, id);
	if (!recipe) {
		return notFound('Recipe');
	}
	return json({ recipe });
});

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const updated = unwrapResult(await updateRecipe(userId, id, body, clientEditedAt));
		// Re-read the full recipe (with ingredients) only when the update actually
		// applied; otherwise respondUpdate maps the miss to a 409/404 for the client.
		const recipe = updated ? await getRecipe(userId, id) : null;
		return respondUpdate({
			key: 'recipe',
			updated: recipe,
			clientEditedAt,
			resourceName: 'Recipe'
		});
	}
);

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id, url }) => {
	const force = url.searchParams.get('force') === 'true';
	const result = await deleteRecipe(userId, id, force);
	if (result.blocked) {
		return json({ error: 'has_entries', entryCount: result.entryCount }, { status: 409 });
	}
	return new Response(null, { status: 204 });
});
