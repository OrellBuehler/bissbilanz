import { error, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/env';
import { getProvider } from '$lib/server/auth-providers';
import {
	buildAuthorizeUrl,
	createCodeChallenge,
	generateCodeVerifier,
	generateNonce,
	generateState
} from '$lib/server/oidc';
import { oidcCookieOptions } from '$lib/server/oidc-cookies';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url, getClientAddress }) => {
	const provider = getProvider(url.searchParams.get('provider') ?? 'infomaniak');
	if (!provider) throw error(404, 'Unknown or disabled sign-in provider');

	try {
		rateLimit(`auth:login:${getClientAddress()}`, 5, 60_000);
	} catch {
		throw error(429, 'Too many requests');
	}

	const state = generateState();
	const nonce = generateNonce();
	const verifier = generateCodeVerifier();
	const challenge = await createCodeChallenge(verifier);
	const secure = config.app.secureCookies;

	cookies.set('oidc_state', state, oidcCookieOptions(secure));
	cookies.set('oidc_nonce', nonce, oidcCookieOptions(secure));
	cookies.set('oidc_verifier', verifier, oidcCookieOptions(secure));

	const authUrl = buildAuthorizeUrl({
		provider,
		redirectUri: provider.redirectUri,
		state,
		nonce,
		codeChallenge: challenge
	});

	throw redirect(302, authUrl);
};
