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
import { storeWebTransaction } from '$lib/server/auth-transactions';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url, locals, getClientAddress }) => {
	const provider = getProvider(url.searchParams.get('provider') ?? 'infomaniak');
	if (!provider) throw error(404, 'Unknown or disabled sign-in provider');

	// Linking connects another provider to the signed-in account rather than
	// creating a second one, so it only makes sense while signed in.
	const isLink = url.searchParams.get('link') === '1';
	if (isLink && !locals.user) throw error(401, 'Sign in before connecting another account');

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

	if (isLink || provider.responseMode === 'form_post') {
		// A form_post provider replies with a cross-site POST, which carries no
		// SameSite=Lax cookies, so its flow state has to live on the server. Link
		// flows use the same store so the intent survives either callback shape.
		storeWebTransaction(state, {
			nonce,
			provider: provider.id,
			flow: isLink ? 'link' : 'login',
			userId: isLink ? locals.user!.id : undefined
		});
	}

	if (provider.responseMode !== 'form_post') {
		cookies.set('oidc_state', state, oidcCookieOptions(secure));
		cookies.set('oidc_nonce', nonce, oidcCookieOptions(secure));
		cookies.set('oidc_verifier', verifier, oidcCookieOptions(secure));
	}

	const authUrl = buildAuthorizeUrl({
		provider,
		redirectUri: provider.redirectUri,
		state,
		nonce,
		codeChallenge: challenge
	});

	throw redirect(302, authUrl);
};
