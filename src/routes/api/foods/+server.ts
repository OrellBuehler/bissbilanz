import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createFood, findFoodByBarcode, listFoods } from '$lib/server/foods';
import { paginationSchema } from '$lib/server/validation';
import { minLabelsSchema } from '$lib/server/validation/labels';
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
			return json({ foods: food ? [food] : [], total: food ? 1 : 0 });
		}

		const paginationResult = paginationSchema.safeParse({
			limit: url.searchParams.get('limit'),
			offset: url.searchParams.get('offset')
		});

		if (!paginationResult.success) {
			return validationError(paginationResult.error);
		}

		const query = url.searchParams.get('q') ?? undefined;
		// Lets a labeller find its work instead of paging everything and diffing
		// client-side: `minLabels=n` returns foods carrying fewer than n labels,
		// and the older `unlabeled=true` means the same as `minLabels=1`.
		let minLabels: number | undefined;
		if (url.searchParams.has('minLabels')) {
			const parsed = minLabelsSchema.safeParse(url.searchParams.get('minLabels'));
			if (!parsed.success) return validationError(parsed.error);
			minLabels = parsed.data;
		} else if (url.searchParams.get('unlabeled') === 'true') {
			minLabels = 1;
		}
		const { offset } = paginationResult.data;
		const limit = url.searchParams.has('limit') ? paginationResult.data.limit : undefined;
		const { items: foods, total } = await listFoods(userId, { query, limit, offset, minLabels });
		return json({ foods, total });
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
