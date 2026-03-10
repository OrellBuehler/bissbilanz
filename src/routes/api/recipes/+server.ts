import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRecipe, listRecipes } from '$lib/server/recipes';
import { handleApiError, requireAuth, unwrapResult, parseJsonBody } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const recipes = await listRecipes(userId);
		return json({ recipes });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);

		const recipe = unwrapResult(await createRecipe(userId, body));
		return json({ recipe }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
