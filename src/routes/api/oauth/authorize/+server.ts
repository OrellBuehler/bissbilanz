import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseSessionCookie, getSessionWithUser } from '$lib/server/session';
import {
	getOAuthClient,
	hasAuthorization,
	createAuthorizationCode,
	validateRedirectUri,
	isValidCodeChallengeS256,
	isValidRedirectUriFormat
} from '$lib/server/oauth';

function oauthError(code: string, detail?: string): never {
	const errorUrl = new URL('/oauth/error', 'http://localhost');
	errorUrl.searchParams.set('code', code);
	if (detail) {
		errorUrl.searchParams.set('detail', detail);
	}
	throw redirect(302, errorUrl.pathname + errorUrl.search);
}

export const GET: RequestHandler = async ({ url, request }) => {
	const responseType = url.searchParams.get('response_type');
	const clientId = url.searchParams.get('client_id');
	const redirectUri = url.searchParams.get('redirect_uri');
	const state = url.searchParams.get('state');
	const codeChallenge = url.searchParams.get('code_challenge');
	const codeChallengeMethod = url.searchParams.get('code_challenge_method');

	if (!clientId || !redirectUri || !state || !codeChallenge || !codeChallengeMethod) {
		oauthError('missing_params');
	}

	if (responseType !== 'code') {
		oauthError('invalid_response_type', `Got "${responseType}" instead of "code"`);
	}

	if (codeChallengeMethod !== 'S256') {
		oauthError('invalid_code_challenge_method', `Got "${codeChallengeMethod}"`);
	}

	if (!isValidCodeChallengeS256(codeChallenge)) {
		oauthError('invalid_code_challenge');
	}

	if (!isValidRedirectUriFormat(redirectUri)) {
		oauthError('invalid_redirect_uri_format', redirectUri);
	}

	const client = await getOAuthClient(clientId);
	if (!client) {
		oauthError('invalid_client', clientId);
	}

	if (!validateRedirectUri(client, redirectUri)) {
		oauthError('unregistered_redirect_uri', redirectUri);
	}

	// Check if user is authenticated
	const sessionId = parseSessionCookie(request.headers.get('cookie'));
	if (!sessionId) {
		const loginUrl = new URL('/', url.origin);
		loginUrl.searchParams.set('redirect', url.pathname + url.search);
		throw redirect(302, loginUrl.toString());
	}

	const sessionData = await getSessionWithUser(sessionId);
	if (!sessionData) {
		const loginUrl = new URL('/', url.origin);
		loginUrl.searchParams.set('redirect', url.pathname + url.search);
		throw redirect(302, loginUrl.toString());
	}

	const userId = sessionData.user.id;

	// Check if user has already authorized this client
	const authorized = await hasAuthorization(userId, clientId);

	if (!authorized) {
		const consentUrl = new URL('/oauth/consent', url.origin);
		consentUrl.searchParams.set('client_id', clientId);
		consentUrl.searchParams.set('redirect_uri', redirectUri);
		consentUrl.searchParams.set('state', state);
		consentUrl.searchParams.set('code_challenge', codeChallenge);
		consentUrl.searchParams.set('code_challenge_method', codeChallengeMethod);
		throw redirect(302, consentUrl.toString());
	}

	// User has already authorized - create authorization code and redirect
	const code = await createAuthorizationCode(userId, clientId, redirectUri, codeChallenge);

	const callbackUrl = new URL(redirectUri);
	callbackUrl.searchParams.set('code', code);
	callbackUrl.searchParams.set('state', state);

	throw redirect(302, callbackUrl.toString());
};
