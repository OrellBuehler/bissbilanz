import { error, redirect } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { getProvider } from '$lib/server/auth-providers';
import {
	generateCodeVerifier,
	createCodeChallenge,
	generateNonce,
	buildAuthorizeUrl
} from '$lib/server/oidc';
import { isValidCodeChallengeS256 } from '$lib/server/oauth';
import { storePendingState } from '$lib/server/mobile-auth';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';
import { getRequestIp } from '$lib/server/client-ip';

export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const state = url.searchParams.get('state');
	if (!state || state.length > 128) {
		throw error(400, 'Missing or invalid state parameter');
	}

	const appCodeChallenge = url.searchParams.get('code_challenge') ?? undefined;
	if (appCodeChallenge !== undefined) {
		const method = url.searchParams.get('code_challenge_method') ?? 'S256';
		if (method !== 'S256' || !isValidCodeChallengeS256(appCodeChallenge)) {
			throw error(400, 'Invalid code_challenge');
		}
	}

	const provider = getProvider(url.searchParams.get('provider') ?? 'infomaniak');
	if (!provider) throw error(404, 'Unknown or disabled sign-in provider');

	try {
		rateLimit(`auth:mobile:${getRequestIp(event)}`, 10, 60_000);
	} catch (err) {
		Sentry.captureException(err, { level: 'warning' });
		throw error(429, 'Too many requests');
	}

	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await createCodeChallenge(codeVerifier);
	const nonce = generateNonce();

	storePendingState(state, codeVerifier, nonce, provider.id, appCodeChallenge);

	const authorizeUrl = buildAuthorizeUrl({
		provider,
		redirectUri: provider.mobileRedirectUri,
		state,
		nonce,
		codeChallenge
	});

	throw redirect(302, authorizeUrl);
};
