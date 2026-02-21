import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { getSessionWithUser } from '$lib/server/session';
import { securityHeaders } from '$lib/server/security';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { runMigrations } from '$lib/server/db';

// Run migrations on server startup
export async function init() {
	await runMigrations();
}

const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest;
		return resolve(event, {
			transformPageChunk: ({ html }) => {
				return html.replace('%lang%', locale);
			}
		});
	});

/** Paths that need CORS and are exempt from CSRF origin checks */
function isCrossOriginEndpoint(pathname: string): boolean {
	return (
		pathname.startsWith('/api/mcp') ||
		pathname.startsWith('/api/oauth/') ||
		pathname.startsWith('/.well-known/') ||
		pathname === '/token'
	);
}

const FORM_CONTENT_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain'
];

/**
 * Manual CSRF origin check for non-exempt routes.
 */
function isOriginMismatch(request: Request, url: URL): boolean {
	const method = request.method;
	if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
		return false;
	}

	const contentType = request.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
	if (!FORM_CONTENT_TYPES.includes(contentType)) {
		return false;
	}

	const origin = request.headers.get('origin');
	if (!origin) return false;

	return origin !== url.origin;
}

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Expose-Headers': 'Mcp-Session-Id'
} as const;

const sessionHandle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	const isCrossOrigin = isCrossOriginEndpoint(pathname);

	// Handle CORS preflight for MCP-related endpoints
	if (event.request.method === 'OPTIONS' && isCrossOrigin) {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}

	// Manual CSRF check for non-exempt routes
	if (!isCrossOrigin && isOriginMismatch(event.request, event.url)) {
		return new Response('Cross-site POST form submissions are forbidden', { status: 403 });
	}

	const sessionId = event.cookies.get('session');

	if (sessionId) {
		const result = await getSessionWithUser(sessionId);
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
		}
	}

	// Protect /app routes - check the de-localized path
	const isAppRoute =
		pathname.startsWith('/app') ||
		pathname.startsWith('/de/app');

	if (isAppRoute && !event.locals.user) {
		throw redirect(302, '/');
	}

	const response = await resolve(event);

	// Add CORS headers to MCP-related responses
	if (isCrossOrigin) {
		const headers = new Headers(response.headers);
		for (const [key, value] of Object.entries(CORS_HEADERS)) {
			headers.set(key, value);
		}
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers
		});
	}

	for (const [key, value] of Object.entries(securityHeaders())) {
		response.headers.set(key, value);
	}
	return response;
};

export const handle = sequence(paraglideHandle, sessionHandle);
