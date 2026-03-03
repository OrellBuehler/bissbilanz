import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGoals, upsertGoals } from '$lib/server/goals';
import { handleApiError, requireAuth, unwrapResult } from '$lib/server/errors';

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
		const goals = unwrapResult(await upsertGoals(userId, body));
		return json({ goals });
	} catch (error) {
		return handleApiError(error);
	}
};
