import { redirect } from '@sveltejs/kit';
import { config } from '$lib/server/env';
import {
	buildAuthorizeUrl,
	createCodeChallenge,
	generateCodeVerifier,
	generateNonce,
	generateState
} from '$lib/server/oidc';
import { oidcCookieOptions } from '$lib/server/oidc-cookies';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const state = generateState();
	const nonce = generateNonce();
	const verifier = generateCodeVerifier();
	const challenge = await createCodeChallenge(verifier);
	const secure = url.protocol === 'https:';

	cookies.set('oidc_state', state, oidcCookieOptions(secure));
	cookies.set('oidc_nonce', nonce, oidcCookieOptions(secure));
	cookies.set('oidc_verifier', verifier, oidcCookieOptions(secure));

	const authUrl = buildAuthorizeUrl({
		clientId: config.infomaniak.clientId,
		redirectUri: config.infomaniak.redirectUri,
		state,
		nonce,
		codeChallenge: challenge
	});

	throw redirect(302, authUrl);
};
