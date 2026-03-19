import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupplementById, updateSupplement, deleteSupplement } from '$lib/server/supplements';
import {
	handleApiError,
	notFound,
	requireAuth,
	requireUuid,
	unwrapResult,
	parseJsonBody
} from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const id = requireUuid(params.id);
		const supplement = await getSupplementById(userId, id);
		if (!supplement) {
			return notFound('Supplement');
		}
		return json({ supplement });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const id = requireUuid(params.id);
		const body = await parseJsonBody(request);
		const supplement = unwrapResult(await updateSupplement(userId, id, body));
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
		const id = requireUuid(params.id);
		await deleteSupplement(userId, id);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
