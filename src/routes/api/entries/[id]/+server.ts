import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteEntry, updateEntry } from '$lib/server/entries';
import { handleApiError, notFound, requireAuth, unwrapResult } from '$lib/server/errors';

export const PATCH: RequestHandler = async ({ locals, request, params }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();
		const entry = unwrapResult(await updateEntry(userId, params.id, body));
		if (!entry) {
			return notFound('Entry');
		}
		return json({ entry });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		await deleteEntry(userId, params.id);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
