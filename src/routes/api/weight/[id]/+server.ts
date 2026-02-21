import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateWeightEntry, deleteWeightEntry } from '$lib/server/weight';
import { handleApiError, requireAuth, isZodError, validationError } from '$lib/server/errors';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();
		const result = await updateWeightEntry(userId, params.id, body);

		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		if (!result.data) {
			return json({ error: 'Weight entry not found' }, { status: 404 });
		}

		return json({ entry: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const deleted = await deleteWeightEntry(userId, params.id);

		if (!deleted) {
			return json({ error: 'Weight entry not found' }, { status: 404 });
		}

		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
