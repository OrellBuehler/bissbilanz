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
import { config, validateEnv } from '$lib/server/env';
import { isCrossOriginEndpoint, isOriginMismatch } from '$lib/server/csrf';
import { env } from '$env/dynamic/public';

if (env.PUBLIC_SENTRY_DSN) {
	Sentry.init({
		dsn: env.PUBLIC_SENTRY_DSN,
		tracesSampleRate: 1.0,
		enableLogs: true
	});
}

// Process-lifetime guard — runMigrations() only needs to run once per process.
// In dev, HMR can re-invoke init() without a full restart; in prod this still
// runs on every cold start (new process = flag resets to false).
let migrationsRan = false;

export async function init() {
	const problems = validateEnv();
	if (problems.length > 0) {
		throw new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
	}
	if (!migrationsRan) {
		try {
			await runMigrations();
			migrationsRan = true;
		} catch (err) {
			console.error('[startup] Migration failed:', err);
			throw err;
		}
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
			let bearerUser: Awaited<ReturnType<typeof getUserById>> | undefined;

			// Test auth bypass — only active when TEST_MODE is set; token comes
			// from TEST_AUTH_TOKEN so no usable credential lives in the repo
			if (config.testMode && config.testAuthToken && token === config.testAuthToken) {
				bearerUser = await withDbRetry(() => getUserById(config.testUserId));
			}

			if (!bearerUser) {
				const tokenResult = await withDbRetry(() => validateAccessToken(token));
				if (tokenResult) {
					bearerUser = await withDbRetry(() => getUserById(tokenResult.userId));
					if (!bearerUser) {
						return json({ error: 'Unauthorized' }, { status: 401 });
					}
				}
			}

			if (bearerUser) {
				event.locals.user = bearerUser;
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
