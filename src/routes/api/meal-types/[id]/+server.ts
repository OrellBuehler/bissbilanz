import { json } from '@sveltejs/kit';
import { deleteMealType, updateMealType } from '$lib/server/meal-types';

export const PATCH = async ({ locals, params, request }) => {
	const body = await request.json();
	const mealType = await updateMealType(locals.user!.id, params.id, body);
	return json({ mealType });
};

export const DELETE = async ({ locals, params }) => {
	await deleteMealType(locals.user!.id, params.id);
	return new Response(null, { status: 204 });
};
