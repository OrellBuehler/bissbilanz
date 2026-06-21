import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGoals, upsertGoals } from '$lib/server/goals';
import { handleApiError, requireAuth, unwrapResult, parseJsonBody } from '$lib/server/errors';
import { respondUpdate } from '$lib/server/sync/conflict';
import { readClientEditedAt } from '$lib/server/sync/headers';

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
		const body = await parseJsonBody(request);
		const clientEditedAt = readClientEditedAt(request);
		const goals = unwrapResult(await upsertGoals(userId, body, clientEditedAt));
		return respondUpdate({ key: 'goals', updated: goals, clientEditedAt, resourceName: 'Goals' });
	} catch (error) {
		return handleApiError(error);
	}
};
