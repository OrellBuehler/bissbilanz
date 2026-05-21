import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, handleApiError } from '$lib/server/errors';
import { getDB } from '$lib/server/db';
import { catalogSearch } from '$lib/server/catalog/queries';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const q = url.searchParams.get('q') ?? '';
		const limitRaw = Number(url.searchParams.get('limit') ?? '20');
		const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
		if (q.trim().length < 2) {
			return json({ results: [] });
		}
		const results = await catalogSearch(getDB(), userId, q, limit);
		return json({ results });
	} catch (error) {
		return handleApiError(error);
	}
};
