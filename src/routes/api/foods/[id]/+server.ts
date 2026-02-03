import { json } from '@sveltejs/kit';
import { deleteFood, updateFood } from '$lib/server/foods';

export const PATCH = async ({ locals, request, params }) => {
	const body = await request.json();
	const food = await updateFood(locals.user.id, params.id, body);
	return json({ food });
};

export const DELETE = async ({ locals, params }) => {
	await deleteFood(locals.user.id, params.id);
	return new Response(null, { status: 204 });
};
