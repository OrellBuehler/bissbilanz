import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteFood, getFood, updateFood } from '$lib/server/foods';
import { handleApiError, notFound, requireAuth, unwrapResult } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const food = await getFood(userId, params.id);
		if (!food) {
			return notFound('Food');
		}
		return json({ food });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, request, params }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();
		const food = unwrapResult(await updateFood(userId, params.id, body));
		if (!food) {
			return notFound('Food');
		}
		return json({ food });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	try {
		const userId = requireAuth(locals);
		const force = url.searchParams.get('force') === 'true';
		const result = await deleteFood(userId, params.id, force);
		if (result.blocked) {
			return json({ error: 'has_entries', entryCount: result.entryCount }, { status: 409 });
		}
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
