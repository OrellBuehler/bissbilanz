import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFoodUsage } from '$lib/server/usage';
import { notFound, withAuthedResource } from '$lib/server/errors';

export const GET: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const usage = await getFoodUsage(userId, id);
	if (!usage) return notFound('Food');
	return json(usage);
});
