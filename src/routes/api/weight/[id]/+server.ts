import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateWeightEntry, deleteWeightEntry } from '$lib/server/weight';
import {
	handleApiError,
	notFound,
	requireAuth,
	requireUuid,
	unwrapResult,
	parseJsonBody
} from '$lib/server/errors';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		const id = requireUuid(params.id);
		const entry = unwrapResult(await updateWeightEntry(userId, id, body));
		if (!entry) {
			return notFound('Weight entry');
		}
		return json({ entry });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const id = requireUuid(params.id);
		const deleted = await deleteWeightEntry(userId, id);

		if (!deleted) {
			return notFound('Weight entry');
		}

		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
