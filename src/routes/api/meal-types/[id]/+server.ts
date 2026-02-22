import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteMealType, updateMealType } from '$lib/server/meal-types';
import {
	handleApiError,
	isZodError,
	notFound,
	requireAuth,
	validationError
} from '$lib/server/errors';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();

		const result = await updateMealType(userId, params.id, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		// Return 404 for both non-existent and unauthorized (don't leak existence)
		if (!result.data) {
			return notFound('Meal type');
		}

		return json({ mealType: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		await deleteMealType(userId, params.id);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
