import { json } from '@sveltejs/kit';
import { requireAuth, handleApiError } from '$lib/server/errors';
import { fetchProduct } from '$lib/server/openfoodfacts';
import { rateLimit } from '$lib/server/rate-limit';
import { isValidBarcode } from '$lib/utils/barcode';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		rateLimit(`off:${userId}`, 30, 60_000);

		const { barcode } = params;
		if (!isValidBarcode(barcode)) {
			return json({ error: 'Invalid barcode format' }, { status: 400 });
		}

		const product = await fetchProduct(barcode);
		if (!product) {
			return json({ error: 'Product not found' }, { status: 404 });
		}

		// `id` mirrors the barcode: the OpenFoodFactsProduct schema requires it and the
		// mobile decoders reject a product without it (the search endpoint does the same).
		return json({ product: { ...product, id: barcode } });
	} catch (error) {
		return handleApiError(error);
	}
};
