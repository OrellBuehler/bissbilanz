import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRecipeUsage } from '$lib/server/usage';
import { notFound, withAuthedResource } from '$lib/server/errors';

export const GET: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const usage = await getRecipeUsage(userId, id);
	if (!usage) return notFound('Recipe');
	return json(usage);
});
