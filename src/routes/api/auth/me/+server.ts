import { json } from '@sveltejs/kit';
import { getSessionWithUser, parseSessionCookie } from '$lib/server/session';
import type { RequestHandler } from './$types';
import type { UserProfile } from '$lib/server/types';

export const GET: RequestHandler = async ({ request }) => {
	const sessionId = parseSessionCookie(request.headers.get('cookie'));

	if (!sessionId) {
		return json({ user: null });
	}

	const result = await getSessionWithUser(sessionId);

	if (!result) {
		return json({ user: null });
	}

	const userProfile: UserProfile = {
		id: result.user.id,
		email: result.user.email,
		name: result.user.name,
		avatarUrl: result.user.avatarUrl
	};

	return json({ user: userProfile });
};
