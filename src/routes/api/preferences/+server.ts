import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getPreferences,
	updatePreferences,
	DEFAULT_PREFERENCES
} from '$lib/server/preferences';
import { handleApiError, isZodError, requireAuth, validationError } from '$lib/server/errors';

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
		const body = await request.json();

		const result = await updatePreferences(userId, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		return json({ preferences: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};
