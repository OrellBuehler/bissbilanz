import { json } from '@sveltejs/kit';
import { createMealType, listMealTypes } from '$lib/server/meal-types';

export const GET = async ({ locals }) => {
	const mealTypes = await listMealTypes(locals.user!.id);
	return json({ mealTypes });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const mealType = await createMealType(locals.user!.id, body);
	return json({ mealType }, { status: 201 });
};
