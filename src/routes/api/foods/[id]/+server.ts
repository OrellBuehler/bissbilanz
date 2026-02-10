import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteFood, updateFood } from '$lib/server/foods';
import { handleApiError, notFound, requireAuth, validationError } from '$lib/server/errors';

export const PATCH: RequestHandler = async ({ locals, request, params }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();

		const result = await updateFood(userId, params.id, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		// Return 404 for both non-existent and unauthorized (don't leak existence)
		if (!result.data) {
			return notFound('Food');
		}

		return json({ food: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		await deleteFood(userId, params.id);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
