import type { RequestHandler } from './$types';
import { deleteAccount } from '$lib/server/account';
import { ApiError, handleApiError, requireAuth } from '$lib/server/errors';
import { rateLimit } from '$lib/server/rate-limit';

export const DELETE: RequestHandler = async ({ locals, cookies }) => {
	try {
		const userId = requireAuth(locals);
		try {
			rateLimit(`account:delete:${userId}`, 3, 60_000);
		} catch {
			throw new ApiError(429, 'Too many requests');
		}

		await deleteAccount(userId);
		cookies.delete('session', { path: '/' });
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
