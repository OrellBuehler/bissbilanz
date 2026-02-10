import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createMealType, listMealTypes } from '$lib/server/meal-types';
import { handleApiError, isZodError, requireAuth, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const mealTypes = await listMealTypes(userId);
		return json({ mealTypes });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();

		const result = await createMealType(userId, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		return json({ mealType: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
