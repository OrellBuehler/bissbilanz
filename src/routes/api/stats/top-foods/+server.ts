import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTopFoods } from '$lib/server/stats';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '7'), 1), 90);
		const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '10'), 1), 50);
		const data = await getTopFoods(userId, days, limit);
		return json({ data });
	} catch (error) {
		return handleApiError(error);
	}
};
