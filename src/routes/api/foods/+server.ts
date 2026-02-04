import { json } from '@sveltejs/kit';
import { createFood, listFoods } from '$lib/server/foods';
import { paginationSchema } from '$lib/server/validation';

export const GET = async ({ locals, url }) => {
	const query = url.searchParams.get('q') ?? undefined;
	const { limit, offset } = paginationSchema.parse({
		limit: url.searchParams.get('limit'),
		offset: url.searchParams.get('offset')
	});
	const foods = await listFoods(locals.user!.id, { query, limit, offset });
	return json({ foods });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const food = await createFood(locals.user!.id, body);
	return json({ food }, { status: 201 });
};
