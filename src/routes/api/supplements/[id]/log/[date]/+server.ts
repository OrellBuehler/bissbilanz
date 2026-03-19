import type { RequestHandler } from './$types';
import { unlogSupplement } from '$lib/server/supplements';
import { handleApiError, requireAuth, requireUuid } from '$lib/server/errors';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const id = requireUuid(params.id);
		await unlogSupplement(userId, id, params.date);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
