import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteMealType, updateMealType } from '$lib/server/meal-types';
import {
	handleApiError,
	notFound,
	requireAuth,
	unwrapResult,
	parseJsonBody
} from '$lib/server/errors';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		const mealType = unwrapResult(await updateMealType(userId, params.id, body));
		if (!mealType) {
			return notFound('Meal type');
		}
		return json({ mealType });
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
