import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTopFoods } from '$lib/server/stats';
import { topFoodsSortSchema } from '$lib/server/validation/stats';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		// Number.isNaN guards against parseInt('abc') → NaN propagating through the
		// clamp and producing an invalid date range downstream.
		const daysRaw = Number.parseInt(url.searchParams.get('days') ?? '7', 10);
		const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);
		const days = Math.min(Math.max(Number.isNaN(daysRaw) ? 7 : daysRaw, 1), 90);
		const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 10 : limitRaw, 1), 50);
		const sort = topFoodsSortSchema.catch('count').parse(url.searchParams.get('sort') ?? 'count');
		const data = await getTopFoods(userId, days, limit, sort);
		return json({ data });
	} catch (error) {
		return handleApiError(error);
	}
};
