import { json } from '@sveltejs/kit';
import { createFood, listFoods } from '$lib/server/foods';

export const GET = async ({ locals, url }) => {
	const query = url.searchParams.get('q') ?? undefined;
	const foods = await listFoods(locals.user.id, query);
	return json({ foods });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const food = await createFood(locals.user.id, body);
	return json({ food }, { status: 201 });
};
