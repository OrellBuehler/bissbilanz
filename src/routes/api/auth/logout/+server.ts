import { error, redirect } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { deleteSession } from '$lib/server/session';
import { assertSameOrigin } from '$lib/server/security';
import { config } from '$lib/server/env';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';
import { getRequestIp } from '$lib/server/client-ip';

export const POST: RequestHandler = async (event) => {
	const { request, cookies } = event;
	try {
		rateLimit(`auth:logout:${getRequestIp(event)}`, 5, 60_000);
	} catch (err) {
		Sentry.captureException(err, { level: 'warning' });
		throw error(429, 'Too many requests');
	}

	const origin = request.headers.get('origin');
	assertSameOrigin(origin, config.app.url);

	const sessionId = cookies.get('session');

	if (sessionId) {
		await deleteSession(sessionId);
	}

	cookies.delete('session', { path: '/' });

	throw redirect(302, '/');
};
