import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteRecipe, getRecipe, updateRecipe } from '$lib/server/recipes';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';

export const GET: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const recipe = await getRecipe(userId, id);
	if (!recipe) {
		return notFound('Recipe');
	}
	return json({ recipe });
});

export const PATCH: RequestHandler = withAuthedResource(async ({ userId, id, request }) => {
	const body = await parseJsonBody(request);
	const updated = unwrapResult(await updateRecipe(userId, id, body));
	if (!updated) {
		return notFound('Recipe');
	}
	const recipe = await getRecipe(userId, id);
	if (!recipe) {
		return notFound('Recipe');
	}
	return json({ recipe });
});

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id, url }) => {
	const force = url.searchParams.get('force') === 'true';
	const result = await deleteRecipe(userId, id, force);
	if (result.blocked) {
		return json({ error: 'has_entries', entryCount: result.entryCount }, { status: 409 });
	}
	return new Response(null, { status: 204 });
});
