import * as Sentry from '@sentry/sveltekit';
import { json, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { getSessionWithUser, getUserById, cleanExpiredSessions } from '$lib/server/session';
import { validateAccessToken } from '$lib/server/oauth';
import { securityHeaders } from '$lib/server/security';
import { rateLimitApi, rateLimitUpload } from '$lib/server/rate-limit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { runMigrations, withDbRetry } from '$lib/server/db';
import { ensureMobileClient } from '$lib/server/mobile-auth';
import { config, validateEnv } from '$lib/server/env';
import { isCrossOriginEndpoint, isFormPostCallback, isOriginMismatch } from '$lib/server/csrf';
import { withIdempotency, cleanupIdempotencyKeys } from '$lib/server/sync/idempotency';
import { cleanupAiTasks } from '$lib/server/ai-tasks';
import { cleanupOrphanedImages } from '$lib/server/image-cleanup';
import { startReminderScheduler } from '$lib/server/push/scheduler';
import { acceptsBearerAuth } from '$lib/server/auth-paths';
import { readIdempotencyKey } from '$lib/server/sync/headers';
import { env } from '$env/dynamic/public';

// Both must be set: a DSN alone would make any local run of the built server
// (default environment "production") report into the live Sentry project.
if (env.PUBLIC_SENTRY_DSN && env.PUBLIC_SENTRY_ENVIRONMENT) {
	Sentry.init({
		dsn: env.PUBLIC_SENTRY_DSN,
		environment: env.PUBLIC_SENTRY_ENVIRONMENT,
		tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
		enableLogs: import.meta.env.DEV
	});
}

/** Scope a bearer token must carry to act on the REST API on a user's behalf. */
const API_ACCESS_SCOPE = 'mcp:access';

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
	const runCleanup = () => {
		cleanExpiredSessions().catch((err) => console.error('[session-cleanup] Error:', err));
		cleanupIdempotencyKeys().catch((err) => console.error('[idempotency-cleanup] Error:', err));
		cleanupAiTasks().catch((err) => console.error('[ai-tasks-cleanup] Error:', err));
		cleanupOrphanedImages().catch((err) => console.error('[image-cleanup] Error:', err));
	};
	runCleanup();
	setInterval(runCleanup, 3600000);
	startReminderScheduler();
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
	'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate'
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
	if (
		!isCrossOrigin &&
		!isFormPostCallback(pathname) &&
		isOriginMismatch(event.request, event.url)
	) {
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

	// Fallback to Bearer token auth for API routes, plus /uploads/: the mobile
	// apps are Bearer-only (no session cookie), and without this every image they
	// render from an upload — AI task meal photos are always one — 401s.
	if (!event.locals.user && acceptsBearerAuth(pathname)) {
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
					// Tokens carry scopes but nothing outside /api/mcp checked them, so a
					// token issued for any purpose granted full account access. Enforce it
					// here too. Every token issued to date defaults to this scope, so this
					// rejects nothing currently valid — it makes the field load-bearing so
					// narrower scopes can actually restrict access later.
					if (!tokenResult.scopes.includes(API_ACCESS_SCOPE)) {
						return json({ error: 'insufficient_scope' }, { status: 403 });
					}
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
		'/account-deletion',
		'/support',
		'/sitemap.xml',
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
	// '/' must match exactly: every path starts with '/', so treating it as a
	// startsWith prefix would mark all routes public and defeat the guard below
	// (which is what happened after authenticated routes moved to the root).
	const isPublicRoute =
		stripped === '/' || PUBLIC_PATHS.some((p) => p !== '/' && stripped.startsWith(p));

	// Unmatched paths (route.id === null) must fall through to a real 404 —
	// redirecting them to /login turns every bad URL into a soft 404 that
	// search engines index as a redirect chain.
	if (!isPublicRoute && !event.locals.user && event.route.id !== null) {
		throw redirect(302, '/login');
	}

	// Rate limit authenticated API write requests
	if (event.locals.user && pathname.startsWith('/api/') && !isMcpRoute(pathname)) {
		const method = event.request.method;
		const userId = event.locals.user.id;
		try {
			if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
				if (
					pathname.startsWith('/api/images/upload') ||
					pathname.startsWith('/api/ai-tasks/photo')
				) {
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

/**
 * Idempotency for offline-queue replays. Runs after sessionHandle so auth has
 * populated locals.user and rate limiting has already applied. Only mutating
 * /api requests that carry an Idempotency-Key are intercepted; everything else
 * passes straight through. MCP routes manage their own request lifecycle.
 */
const idempotencyHandle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	const method = event.request.method;
	const isWrite =
		method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
	const user = event.locals.user;

	if (!isWrite || !user || !pathname.startsWith('/api/') || isMcpRoute(pathname)) {
		return resolve(event);
	}

	const key = readIdempotencyKey(event.request);
	if (!key) return resolve(event);

	return withIdempotency(event, resolve, user.id, key);
};

export const handle = sequence(
	Sentry.sentryHandle(),
	paraglideHandle,
	sessionHandle,
	idempotencyHandle
);

const logUnexpectedError: HandleServerError = ({ error, status }) => {
	// Don't log noise for unmatched routes / 404s (legacy API paths, scanners).
	// Sentry already declines to capture 4xx errors; this just silences the
	// console.error its default handler would otherwise emit.
	if (status === 404) return;
	console.error(error instanceof Error ? error.stack : error);
};

export const handleError = Sentry.handleErrorWithSentry(logUnexpectedError);
