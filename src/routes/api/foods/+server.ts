import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createFood, findFoodByBarcode, listFoods } from '$lib/server/foods';
import { paginationSchema } from '$lib/server/validation';
import {
	handleApiError,
	requireAuth,
	unwrapResult,
	validationError,
	parseJsonBody
} from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);

		const barcode = url.searchParams.get('barcode');
		if (barcode) {
			if (!/^\d{8,13}$/.test(barcode)) {
				return json({ error: 'Invalid barcode format' }, { status: 400 });
			}
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
		const { offset } = paginationResult.data;
		const limit = url.searchParams.has('limit') ? paginationResult.data.limit : undefined;
		const foods = await listFoods(userId, { query, limit, offset });
		return json({ foods });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		const food = unwrapResult(await createFood(userId, body));
		return json({ food }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
