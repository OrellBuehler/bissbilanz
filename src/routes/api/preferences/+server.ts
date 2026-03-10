import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPreferences, updatePreferences, DEFAULT_PREFERENCES } from '$lib/server/preferences';
import { handleApiError, requireAuth, unwrapResult, parseJsonBody } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const preferences = await getPreferences(userId);
		return json({ preferences: preferences ?? DEFAULT_PREFERENCES });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);

		const preferences = unwrapResult(await updatePreferences(userId, body));
		return json({ preferences });
	} catch (error) {
		return handleApiError(error);
	}
};
