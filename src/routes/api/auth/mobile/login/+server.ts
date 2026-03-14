import { error, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/env';
import {
	generateCodeVerifier,
	createCodeChallenge,
	generateNonce,
	buildAuthorizeUrl
} from '$lib/server/oidc';
import { storePendingState } from '$lib/server/mobile-auth';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const state = url.searchParams.get('state');
	if (!state) {
		throw error(400, 'Missing state parameter');
	}

	try {
		rateLimit(`auth:mobile:${getClientAddress()}`, 10, 60_000);
	} catch {
		throw error(429, 'Too many requests');
	}

	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await createCodeChallenge(codeVerifier);
	const nonce = generateNonce();

	storePendingState(state, codeVerifier, nonce);

	const authorizeUrl = buildAuthorizeUrl({
		clientId: config.infomaniak.clientId,
		redirectUri: `${config.app.url}/api/auth/mobile/callback`,
		state,
		nonce,
		codeChallenge
	});

	throw redirect(302, authorizeUrl);
};
