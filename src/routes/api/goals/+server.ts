import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGoals, upsertGoals } from '$lib/server/goals';
import { handleApiError, isZodError, requireAuth, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const goals = await getGoals(userId);
		return json({ goals });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();

		const result = await upsertGoals(userId, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		return json({ goals: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};
