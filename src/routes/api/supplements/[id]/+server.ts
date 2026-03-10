import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupplementById, updateSupplement, deleteSupplement } from '$lib/server/supplements';
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
		const supplement = await getSupplementById(userId, params.id);
		if (!supplement) {
			return notFound('Supplement');
		}
		return json({ supplement });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		const supplement = unwrapResult(await updateSupplement(userId, params.id, body));
		if (!supplement) {
			return notFound('Supplement');
		}
		return json({ supplement });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		await deleteSupplement(userId, params.id);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
