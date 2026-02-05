import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteFood, updateFood } from '$lib/server/foods';

export const PATCH: RequestHandler = async ({ locals, request, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const body = await request.json();
	const food = await updateFood(locals.user.id, params.id, body);
	return json({ food });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	await deleteFood(locals.user.id, params.id);
	return new Response(null, { status: 204 });
};
