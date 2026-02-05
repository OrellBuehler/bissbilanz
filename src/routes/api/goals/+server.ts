import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGoals, upsertGoals } from '$lib/server/goals';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const goals = await getGoals(locals.user.id);
	return json({ goals });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const body = await request.json();
	const goals = await upsertGoals(locals.user.id, body);
	return json({ goals });
};
