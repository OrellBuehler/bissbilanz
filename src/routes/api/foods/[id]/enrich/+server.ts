import * as Sentry from '@sentry/sveltekit';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { notFound, withAuthedResource } from '$lib/server/errors';
import { getFood } from '$lib/server/foods';
import { enrichFood } from '$lib/server/food-enrichment/enrich';
import { rateLimit } from '$lib/server/rate-limit';

export const POST: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const food = await getFood(userId, id);
	if (!food) return notFound('Food');
	if (!food.barcode?.trim()) {
		return json({ error: 'Food has no barcode' }, { status: 400 });
	}

	rateLimit(`off:${userId}`, 30, 60_000);
	const result = await enrichFood(userId, id, food.barcode);

	switch (result.status) {
		case 'updated':
		case 'unchanged':
			return json({ food: result.food });
		case 'not_found':
			return json({ error: 'Product not found' }, { status: 404 });
		case 'skipped':
			return json({ error: 'Food changed during the lookup' }, { status: 409 });
		case 'unavailable':
			Sentry.addBreadcrumb({
				category: 'food-enrichment',
				level: 'warning',
				message: 'Open Food Facts unavailable',
				data: { httpStatus: result.httpStatus, retryAfterSeconds: result.retryAfterSeconds }
			});
			return json(
				{ error: 'Open Food Facts is unavailable' },
				{
					status: 503,
					headers: result.retryAfterSeconds
						? { 'Retry-After': String(result.retryAfterSeconds) }
						: undefined
				}
			);
	}
});
