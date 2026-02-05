import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createFood, findFoodByBarcode, listFoods } from '$lib/server/foods';
import { paginationSchema } from '$lib/server/validation';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const barcode = url.searchParams.get('barcode');
	if (barcode) {
		const food = await findFoodByBarcode(locals.user.id, barcode);
		return json({ food });
	}
	const query = url.searchParams.get('q') ?? undefined;
	const { limit, offset } = paginationSchema.parse({
		limit: url.searchParams.get('limit'),
		offset: url.searchParams.get('offset')
	});
	const foods = await listFoods(locals.user.id, { query, limit, offset });
	return json({ foods });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const body = await request.json();
	const food = await createFood(locals.user.id, body);
	return json({ food }, { status: 201 });
};
