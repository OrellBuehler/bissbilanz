import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupplementById, updateSupplement, deleteSupplement } from '$lib/server/supplements';
import { handleApiError, requireAuth, isZodError, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const supplement = await getSupplementById(userId, params.id);
		if (!supplement) {
			return json({ error: 'Supplement not found' }, { status: 404 });
		}
		return json({ supplement });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();
		const result = await updateSupplement(userId, params.id, body);

		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		if (!result.data) {
			return json({ error: 'Supplement not found' }, { status: 404 });
		}

		return json({ supplement: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		await deleteSupplement(userId, params.id);
		return json({ success: true });
	} catch (error) {
		return handleApiError(error);
	}
};
