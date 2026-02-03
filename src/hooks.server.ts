import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { getSessionWithUser, parseSessionCookie } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = parseSessionCookie(event.request.headers.get('cookie'));

	if (sessionId) {
		const result = await getSessionWithUser(sessionId);
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
		}
	}

	// Protect /app routes
	if (event.url.pathname.startsWith('/app') && !event.locals.user) {
		throw redirect(302, '/');
	}

	return resolve(event);
};
