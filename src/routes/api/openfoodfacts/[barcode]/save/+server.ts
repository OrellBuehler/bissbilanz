import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, handleApiError } from '$lib/server/errors';
import { getDB } from '$lib/server/db';
import { createFood, findFoodByBarcode } from '$lib/server/foods';
import { fetchProduct } from '$lib/server/openfoodfacts';
import { rateLimit } from '$lib/server/rate-limit';
import { isValidBarcode } from '$lib/utils/barcode';
import { roundNutrition } from '$lib/utils/round-nutrition';

export const POST: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const { barcode } = params;
		if (!isValidBarcode(barcode)) {
			return json({ error: 'Invalid barcode format' }, { status: 400 });
		}
		// Copy-on-use is idempotent: if this barcode is already a personal food,
		// return it instead of erroring on the barcode-unique constraint.
		const existing = await findFoodByBarcode(userId, barcode);
		if (existing) {
			return json({ food: roundNutrition(existing) });
		}
		rateLimit(`off:${userId}`, 30, 60_000);
		const product = await fetchProduct(barcode);
		if (!product) {
			return json({ error: 'Product not found' }, { status: 404 });
		}
		const result = await createFood(userId, product, getDB());
		if (!result.success) {
			return handleApiError(result.error);
		}
		return json({ food: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
