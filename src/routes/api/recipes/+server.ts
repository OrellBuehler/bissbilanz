import { json } from '@sveltejs/kit';
import { createRecipe, listRecipes } from '$lib/server/recipes';

export const GET = async ({ locals }) => {
	const recipes = await listRecipes(locals.user!.id);
	return json({ recipes });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const recipe = await createRecipe(locals.user!.id, body);
	return json({ recipe }, { status: 201 });
};
