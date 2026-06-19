import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, handleApiError } from '$lib/server/errors';
import { searchProducts } from '$lib/server/openfoodfacts';
import { rateLimit } from '$lib/server/rate-limit';
import { isValidBarcode } from '$lib/utils/barcode';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		rateLimit(`off-search:${userId}`, 30, 60_000);
		const q = url.searchParams.get('q') ?? '';
		if (q.trim().length < 2) {
			return json({ results: [] });
		}
		const limitRaw = Number(url.searchParams.get('limit') ?? '10');
		const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 10;
		const products = await searchProducts(q, limit);
		// Only surface products that can be instantiated by barcode (copy-on-use),
		// so every result in the picker is pickable. `id` mirrors the barcode to
		// satisfy the shared OpenFoodFactsProduct shape.
		const results = products
			.filter((p) => isValidBarcode(p.barcode))
			.map((p) => ({ ...p, id: p.barcode }));
		return json({ results });
	} catch (error) {
		return handleApiError(error);
	}
};
