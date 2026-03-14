import { json, error } from '@sveltejs/kit';
import { consumeOneTimeCode } from '$lib/server/mobile-auth';
import { createAccessToken, refreshAccessToken } from '$lib/server/oauth';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const MOBILE_CLIENT_ID = 'bissbilanz-mobile';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		rateLimit(`auth:mobile:token:${getClientAddress()}`, 10, 60_000);
	} catch {
		throw error(429, 'Too many requests');
	}

	let body: { code?: string; refresh_token?: string };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	if (body.code) {
		const userId = consumeOneTimeCode(body.code);
		if (!userId) {
			throw error(400, 'Invalid or expired code');
		}

		const { accessToken, refreshToken } = await createAccessToken(userId, MOBILE_CLIENT_ID);

		return json({
			access_token: accessToken,
			refresh_token: refreshToken,
			token_type: 'Bearer',
			expires_in: 3600
		});
	}

	if (body.refresh_token) {
		const result = await refreshAccessToken(body.refresh_token, MOBILE_CLIENT_ID);
		if (!result) {
			throw error(401, 'Invalid or expired refresh token');
		}

		return json({
			access_token: result.accessToken,
			refresh_token: result.refreshToken,
			token_type: 'Bearer',
			expires_in: 3600
		});
	}

	throw error(400, 'Must provide either code or refresh_token');
};
