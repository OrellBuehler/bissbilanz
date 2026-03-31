import * as Sentry from '@sentry/sveltekit';
import { json, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { getSessionWithUser, getUserById, cleanExpiredSessions } from '$lib/server/session';
import { validateAccessToken } from '$lib/server/oauth';
import { securityHeaders } from '$lib/server/security';
import { rateLimitApi, rateLimitUpload } from '$lib/server/rate-limit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { runMigrations, withDbRetry } from '$lib/server/db';
import { ensureMobileClient } from '$lib/server/mobile-auth';
import { config } from '$lib/server/env';
import { env } from '$env/dynamic/public';

if (env.PUBLIC_SENTRY_DSN) {
	Sentry.init({
		dsn: env.PUBLIC_SENTRY_DSN,
		tracesSampleRate: 1.0,
		enableLogs: true
	});
}

export async function init() {
	try {
		await runMigrations();
	} catch (err) {
		console.error('[startup] Migration failed:', err);
		throw err;
	}
	await ensureMobileClient();
	cleanExpiredSessions().catch((err) => console.error('[session-cleanup] Error:', err));
	setInterval(
		() => cleanExpiredSessions().catch((err) => console.error('[session-cleanup] Error:', err)),
		3600000
	);
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
	if (!origin) return true;

	return origin !== url.origin;
}

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Expose-Headers': 'Mcp-Session-Id'
} as const;

function isMcpRoute(pathname: string): boolean {
	return (
		pathname.startsWith('/api/mcp') ||
		pathname.startsWith('/api/oauth/') ||
		pathname.startsWith('/.well-known/oauth-authorization-server')
	);
}

const sessionHandle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;

	if (!config.mcp.enabled && isMcpRoute(pathname)) {
		return new Response('Not Found', { status: 404 });
	}

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
		const result = await withDbRetry(() => getSessionWithUser(sessionId));
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
		}
	}

	// Fallback to Bearer token auth for API routes
	if (!event.locals.user && pathname.startsWith('/api/')) {
		const authHeader = event.request.headers.get('authorization');
		if (authHeader?.startsWith('Bearer ')) {
			const token = authHeader.slice(7);

			// Test auth bypass — only active when TEST_MODE is set
			if (config.testMode && token === 'test-integration-token') {
				const user = await withDbRetry(() => getUserById(config.testUserId));
				if (user) {
					event.locals.user = user;
				}
			}

			if (!event.locals.user) {
				const tokenResult = await withDbRetry(() => validateAccessToken(token));
				if (tokenResult) {
					const user = await withDbRetry(() => getUserById(tokenResult.userId));
					if (!user) {
						return json({ error: 'Unauthorized' }, { status: 401 });
					}
					event.locals.user = user;
				}
			}
		}
	}

	// Protect all routes except public ones
	const PUBLIC_PATHS = [
		'/',
		'/login',
		'/privacy',
		'/api/',
		'/authorize',
		'/token',
		'/oauth/',
		'/.well-known/',
		'/uploads/'
	];
	const stripped = pathname.startsWith('/de/')
		? pathname.slice(3)
		: pathname === '/de'
			? '/'
			: pathname;
	const isPublicRoute = PUBLIC_PATHS.some((p) => stripped.startsWith(p));

	if (!isPublicRoute && !event.locals.user) {
		throw redirect(302, '/login');
	}

	// Rate limit authenticated API write requests
	if (event.locals.user && pathname.startsWith('/api/') && !isMcpRoute(pathname)) {
		const method = event.request.method;
		const userId = event.locals.user.id;
		try {
			if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
				if (pathname.startsWith('/api/images/upload')) {
					rateLimitUpload(userId);
				} else {
					rateLimitApi(userId);
				}
			}
		} catch {
			return json({ error: 'Rate limit exceeded' }, { status: 429 });
		}
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

export const handle = sequence(Sentry.sentryHandle(), paraglideHandle, sessionHandle);

export const handleError = Sentry.handleErrorWithSentry();
