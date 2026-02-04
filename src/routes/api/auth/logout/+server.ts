import { redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/session';
import { assertSameOrigin } from '$lib/server/security';
import { config } from '$lib/server/env';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const origin = request.headers.get('origin');
	assertSameOrigin(origin, config.app.url);

	const sessionId = cookies.get('session');

	if (sessionId) {
		await deleteSession(sessionId);
	}

	cookies.delete('session', { path: '/' });

	throw redirect(302, '/');
};
