import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { deleteAccount } from '$lib/server/account';
import { getDB, users } from '$lib/server/db';
import { ApiError, handleApiError, requireAuth } from '$lib/server/errors';
import { rateLimit } from '$lib/server/rate-limit';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const db = getDB();
		const [user] = await db
			.select({
				email: users.email,
				name: users.name,
				createdAt: users.createdAt
			})
			.from(users)
			.where(eq(users.id, userId));
		if (!user) throw new ApiError(404, 'User not found');
		return json({ user });
	} catch (error) {
		return handleApiError(error);
	}
};

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
