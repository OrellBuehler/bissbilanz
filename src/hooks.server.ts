import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { getSessionWithUser } from '$lib/server/session';
import { securityHeaders } from '$lib/server/security';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session');

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

	const response = await resolve(event);
	for (const [key, value] of Object.entries(securityHeaders())) {
		response.headers.set(key, value);
	}
	return response;
};
