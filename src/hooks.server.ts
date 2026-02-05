import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { getSessionWithUser } from '$lib/server/session';
import { securityHeaders } from '$lib/server/security';
import { paraglideMiddleware } from '$lib/paraglide/server';

const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest;
		return resolve(event, {
			transformPageChunk: ({ html }) => {
				return html.replace('%lang%', locale);
			}
		});
	});

const sessionHandle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session');

	if (sessionId) {
		const result = await getSessionWithUser(sessionId);
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
		}
	}

	// Protect /app routes - check the de-localized path
	const pathname = event.url.pathname;
	const isAppRoute = pathname.startsWith('/app') ||
		pathname.startsWith('/de/app') ||
		pathname.startsWith('/fr/app') ||
		pathname.startsWith('/it/app');

	if (isAppRoute && !event.locals.user) {
		throw redirect(302, '/');
	}

	const response = await resolve(event);
	for (const [key, value] of Object.entries(securityHeaders())) {
		response.headers.set(key, value);
	}
	return response;
};

export const handle = sequence(paraglideHandle, sessionHandle);
