import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createFood, findFoodByBarcode, listFoods } from '$lib/server/foods';
import { paginationSchema } from '$lib/server/validation';
import { handleApiError, isZodError, requireAuth, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);

		const barcode = url.searchParams.get('barcode');
		if (barcode) {
			const food = await findFoodByBarcode(userId, barcode);
			return json({ food });
		}

		const paginationResult = paginationSchema.safeParse({
			limit: url.searchParams.get('limit'),
			offset: url.searchParams.get('offset')
		});

		if (!paginationResult.success) {
			return validationError(paginationResult.error);
		}

		const query = url.searchParams.get('q') ?? undefined;
		const { limit, offset } = paginationResult.data;
		const foods = await listFoods(userId, { query, limit, offset });
		return json({ foods });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();

		const result = await createFood(userId, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		return json({ food: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
