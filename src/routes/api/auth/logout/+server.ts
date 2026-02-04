import { error, redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/session';
import { assertSameOrigin } from '$lib/server/security';
import { config } from '$lib/server/env';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	try {
		rateLimit(`auth:logout:${getClientAddress()}`, 5, 60_000);
	} catch {
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
