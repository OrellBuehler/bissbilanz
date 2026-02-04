import { json } from '@sveltejs/kit';
import { getGoals, upsertGoals } from '$lib/server/goals';

export const GET = async ({ locals }) => {
	const goals = await getGoals(locals.user.id);
	return json({ goals });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const goals = await upsertGoals(locals.user.id, body);
	return json({ goals });
};
