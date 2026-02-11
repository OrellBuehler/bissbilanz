import { json } from '@sveltejs/kit';
import { requireAuth, handleApiError } from '$lib/server/errors';
import { fetchProduct } from '$lib/server/openfoodfacts';
import { isValidBarcode } from '$lib/utils/barcode';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		requireAuth(locals);

		const { barcode } = params;
		if (!isValidBarcode(barcode)) {
			return json({ error: 'Invalid barcode format' }, { status: 400 });
		}

		const product = await fetchProduct(barcode);
		if (!product) {
			return json({ error: 'Product not found' }, { status: 404 });
		}

		return json({ product });
	} catch (error) {
		return handleApiError(error);
	}
};
