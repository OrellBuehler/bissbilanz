import type { RequestHandler } from './$types';
import { unlogSupplement } from '$lib/server/supplements';
import { requireDate, withAuthedResource } from '$lib/server/errors';

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id, params }) => {
	const date = requireDate(params.date);
	await unlogSupplement(userId, id, date);
	return new Response(null, { status: 204 });
});
