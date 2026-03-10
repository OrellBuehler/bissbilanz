import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteRecipe, getRecipe, updateRecipe } from '$lib/server/recipes';
import {
	handleApiError,
	notFound,
	requireAuth,
	unwrapResult,
	parseJsonBody
} from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const recipe = await getRecipe(userId, params.id);
		if (!recipe) {
			return notFound('Recipe');
		}
		return json({ recipe });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		const recipe = unwrapResult(await updateRecipe(userId, params.id, body));
		if (!recipe) {
			return notFound('Recipe');
		}
		return json({ recipe });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	try {
		const userId = requireAuth(locals);
		const force = url.searchParams.get('force') === 'true';
		const result = await deleteRecipe(userId, params.id, force);
		if (result.blocked) {
			return json({ error: 'has_entries', entryCount: result.entryCount }, { status: 409 });
		}
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
