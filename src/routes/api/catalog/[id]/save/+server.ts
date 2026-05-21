import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, requireUuid, handleApiError } from '$lib/server/errors';
import { getDB } from '$lib/server/db';
import { instantiateCatalogFood } from '$lib/server/catalog/queries';

export const POST: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const id = requireUuid(params.id);
		const result = await instantiateCatalogFood(getDB(), userId, id);
		if (result === null) {
			return json({ error: 'Catalog food not found or not accessible' }, { status: 404 });
		}
		if (!result.success) {
			return handleApiError(result.error);
		}
		return json({ food: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
