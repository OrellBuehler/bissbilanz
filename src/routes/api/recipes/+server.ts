import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRecipe, listRecipes } from '$lib/server/recipes';
import { handleApiError, isZodError, requireAuth, validationError } from '$lib/server/errors';

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
		const body = await request.json();

		const result = await createRecipe(userId, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		return json({ recipe: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
