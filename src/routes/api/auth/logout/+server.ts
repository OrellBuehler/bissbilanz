import { redirect } from '@sveltejs/kit';
import { deleteSession, parseSessionCookie } from '$lib/server/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const sessionId = parseSessionCookie(request.headers.get('cookie'));

	if (sessionId) {
		await deleteSession(sessionId);
	}

	cookies.delete('session', { path: '/' });

	throw redirect(302, '/');
};
