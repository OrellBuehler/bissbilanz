import { json } from '@sveltejs/kit';
import { deleteRecipe, getRecipe, updateRecipe } from '$lib/server/recipes';

export const GET = async ({ locals, params }) => {
	const recipe = await getRecipe(locals.user!.id, params.id);
	if (!recipe) {
		return json({ error: 'Recipe not found' }, { status: 404 });
	}
	return json({ recipe });
};

export const PATCH = async ({ locals, params, request }) => {
	const body = await request.json();
	const recipe = await updateRecipe(locals.user!.id, params.id, body);
	return json({ recipe });
};

export const DELETE = async ({ locals, params }) => {
	await deleteRecipe(locals.user!.id, params.id);
	return new Response(null, { status: 204 });
};
