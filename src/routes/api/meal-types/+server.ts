import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createMealType, listMealTypes } from '$lib/server/meal-types';
import { handleApiError, requireAuth, unwrapResult } from '$lib/server/errors';

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
		const mealType = unwrapResult(await createMealType(userId, body));
		return json({ mealType }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
