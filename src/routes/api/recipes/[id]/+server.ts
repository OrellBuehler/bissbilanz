import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteRecipe, getRecipe, updateRecipe } from '$lib/server/recipes';
import { handleApiError, isZodError, notFound, requireAuth, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const recipe = await getRecipe(userId, params.id);
		if (!recipe) {
			return notFound('Recipe');
		}
		return json({ recipe });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();

		const result = await updateRecipe(userId, params.id, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		// Return 404 for both non-existent and unauthorized (don't leak existence)
		if (!result.data) {
			return notFound('Recipe');
		}

		return json({ recipe: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		await deleteRecipe(userId, params.id);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
