import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteMealType, updateMealType } from '$lib/server/meal-types';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';

export const PATCH: RequestHandler = withAuthedResource(async ({ userId, id, request }) => {
	const body = await parseJsonBody(request);
	const mealType = unwrapResult(await updateMealType(userId, id, body));
	if (!mealType) {
		return notFound('Meal type');
	}
	return json({ mealType });
});

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	await deleteMealType(userId, id);
	return new Response(null, { status: 204 });
});
