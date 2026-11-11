import * as Sentry from '@sentry/sveltekit';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuthedResource } from '$lib/server/errors';
import { getFood } from '$lib/server/foods';
import { enrichFood } from '$lib/server/food-enrichment/enrich';
import { rateLimit } from '$lib/server/rate-limit';

const failure = (status: number, code: string, error: string, headers?: HeadersInit) =>
	json({ error, code }, { status, headers });

export const POST: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const food = await getFood(userId, id);
	if (!food) return failure(404, 'food_not_found', 'Food not found');
	if (!food.barcode?.trim()) return failure(400, 'no_barcode', 'Food has no barcode');

	rateLimit(`off:${userId}`, 30, 60_000);
	const result = await enrichFood(userId, id, food.barcode);

	switch (result.status) {
		case 'updated':
		case 'unchanged':
			return json({ food: result.food, outcome: result.status });
		case 'not_found':
			return failure(404, 'product_not_found', 'Product not found');
		case 'skipped':
			return failure(409, 'food_changed', 'Food changed during the lookup');
		case 'invalid':
			return failure(
				502,
				'off_invalid_response',
				'Open Food Facts returned a product that could not be read'
			);
		case 'unavailable':
			Sentry.addBreadcrumb({
				category: 'food-enrichment',
				level: 'warning',
				message: 'Open Food Facts unavailable',
				data: { httpStatus: result.httpStatus, retryAfterSeconds: result.retryAfterSeconds }
			});
			return failure(
				503,
				'off_unavailable',
				'Open Food Facts is unavailable',
				result.retryAfterSeconds ? { 'Retry-After': String(result.retryAfterSeconds) } : undefined
			);
	}
});
