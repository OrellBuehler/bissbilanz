import * as Sentry from '@sentry/sveltekit';
import { json, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { getSessionWithUser, getUserById, cleanExpiredSessions } from '$lib/server/session';
import { validateAccessToken, cleanupExpiredOAuthData } from '$lib/server/oauth';
import { securityHeaders } from '$lib/server/security';
import { rateLimitWrite } from '$lib/server/rate-limit';
import { rateLimitedResponse } from '$lib/server/errors';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { runMigrations, withDbRetry } from '$lib/server/db';
import { ensureMobileClient } from '$lib/server/mobile-auth';
import { config, validateEnv } from '$lib/server/env';
import { isCrossOriginEndpoint, isCsrfViolation } from '$lib/server/csrf';
import { withIdempotency, cleanupIdempotencyKeys } from '$lib/server/sync/idempotency';
import { cleanupAiTasks } from '$lib/server/ai-tasks';
import { cleanupOrphanedImages } from '$lib/server/image-cleanup';
import { startReminderScheduler } from '$lib/server/push/scheduler';
import { acceptsBearerAuth } from '$lib/server/auth-paths';
import { readIdempotencyKey } from '$lib/server/sync/headers';
import {
	readClientInfo,
	recordClientVersion,
	requiredMinimum,
	updateRequiredResponse
} from '$lib/server/client-version';
import { env } from '$env/dynamic/public';

// Both must be set: a DSN alone would make any local run of the built server
// (default environment "production") report into the live Sentry project.
if (env.PUBLIC_SENTRY_DSN && env.PUBLIC_SENTRY_ENVIRONMENT) {
	Sentry.init({
		dsn: env.PUBLIC_SENTRY_DSN,
		environment: env.PUBLIC_SENTRY_ENVIRONMENT,
		tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
		beforeSendLog: (log) => (import.meta.env.DEV ? log : null)
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
			Sentry.captureException(err, { tags: { job: 'migrations' } });
			await Sentry.flush(2000);
			throw err;
		}
	}
	await ensureMobileClient();
	const runCleanup = () => {
		const jobs: Record<string, () => Promise<unknown>> = {
			'session-cleanup': cleanExpiredSessions,
			'idempotency-cleanup': cleanupIdempotencyKeys,
			'ai-tasks-cleanup': cleanupAiTasks,
			'image-cleanup': cleanupOrphanedImages,
			'oauth-cleanup': cleanupExpiredOAuthData
		};
		for (const [job, run] of Object.entries(jobs)) {
			run().catch((err) => {
				console.error(`[${job}] Error:`, err);
				Sentry.captureException(err, { tags: { job } });
			});
		}
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
		pathname.startsWith('/.well-known/oauth-authorization-server') ||
		pathname.startsWith('/.well-known/oauth-protected-resource')
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
	if (isCsrfViolation(event.request, event.url)) {
		return new Response('Cross-site requests are forbidden', { status: 403 });
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
				event.locals.tokenScopes = [API_ACCESS_SCOPE, 'account:manage'];
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
					event.locals.tokenScopes = tokenResult.scopes;
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
		'/help',
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
				rateLimitWrite(userId, pathname);
			}
		} catch (err) {
			return rateLimitedResponse(err, { error: 'Rate limit exceeded' });
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
 * Client version gate. Runs after sessionHandle (so the 426 still gets security
 * headers) and before idempotencyHandle (so a rejected replay doesn't claim its
 * key and can run once the app is updated). Requests without version headers
 * pass untouched.
 */
const clientVersionHandle: Handle = async ({ event, resolve }) => {
	if (!event.url.pathname.startsWith('/api/')) return resolve(event);
	const client = readClientInfo(event.request);
	if (!client) return resolve(event);

	Sentry.setTag('client.platform', client.platform);
	Sentry.setTag('client.version', client.version);
	if (event.locals.user) recordClientVersion(client);

	const minimum = requiredMinimum(client);
	if (minimum) return updateRequiredResponse(client.platform, minimum);
	return resolve(event);
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
	clientVersionHandle,
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
