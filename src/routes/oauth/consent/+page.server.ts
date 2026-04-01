import { redirect, fail, isRedirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { parseSessionCookie, getSessionWithUser } from '$lib/server/session';
import {
	getOAuthClient,
	createAuthorization,
	createAuthorizationCode,
	validateRedirectUri,
	isValidCodeChallengeS256,
	isUrlClientId,
	fetchClientIdMetadata,
	ensureUrlClientInDb
} from '$lib/server/oauth';

export const load: PageServerLoad = async ({ url, request }) => {
	const clientId = url.searchParams.get('client_id');
	const redirectUri = url.searchParams.get('redirect_uri');
	const state = url.searchParams.get('state');
	const codeChallenge = url.searchParams.get('code_challenge');
	const codeChallengeMethod = url.searchParams.get('code_challenge_method');

	if (!clientId || !redirectUri || !state || !codeChallenge || !codeChallengeMethod) {
		throw redirect(302, '/oauth/error?code=missing_params');
	}

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

	if (codeChallengeMethod !== 'S256') {
		throw redirect(
			302,
			`/oauth/error?code=invalid_code_challenge_method&detail=${encodeURIComponent(codeChallengeMethod)}`
		);
	}

	if (!isValidCodeChallengeS256(codeChallenge)) {
		throw redirect(302, '/oauth/error?code=invalid_code_challenge');
	}

	if (isUrlClientId(clientId)) {
		let metadata;
		try {
			metadata = await fetchClientIdMetadata(clientId);
		} catch {
			throw redirect(302, '/oauth/error?code=invalid_client');
		}

		const normalizedRedirect = redirectUri.replace(/\/$/, '');
		const validRedirect = metadata.redirect_uris.some(
			(uri) => uri.replace(/\/$/, '') === normalizedRedirect
		);

		if (!validRedirect) {
			throw redirect(
				302,
				`/oauth/error?code=unregistered_redirect_uri&detail=${encodeURIComponent(redirectUri)}`
			);
		}

		return {
			clientId,
			clientName: metadata.client_name ?? clientId,
			clientUri: metadata.client_uri ?? null,
			isUrlClient: true,
			redirectUri,
			state,
			codeChallenge,
			codeChallengeMethod
		};
	}

	const client = await getOAuthClient(clientId);
	if (!client) {
		throw redirect(302, `/oauth/error?code=invalid_client&detail=${encodeURIComponent(clientId)}`);
	}

	if (!validateRedirectUri(client, redirectUri)) {
		throw redirect(
			302,
			`/oauth/error?code=unregistered_redirect_uri&detail=${encodeURIComponent(redirectUri)}`
		);
	}

	return {
		clientId,
		clientName: client.clientName,
		clientUri: null,
		isUrlClient: false,
		redirectUri,
		state,
		codeChallenge,
		codeChallengeMethod
	};
};

export const actions = {
	approve: async ({ request }) => {
		const formData = await request.formData();
		const clientId = formData.get('client_id')?.toString();
		const redirectUri = formData.get('redirect_uri')?.toString();
		const state = formData.get('state')?.toString();
		const codeChallenge = formData.get('code_challenge')?.toString();
		const codeChallengeMethod = formData.get('code_challenge_method')?.toString();

		if (!clientId || !redirectUri || !state || !codeChallenge || !codeChallengeMethod) {
			return fail(400, { error: 'Missing required parameters' });
		}

		if (codeChallengeMethod !== 'S256') {
			return fail(400, { error: 'Invalid code_challenge_method. Only S256 is supported' });
		}

		if (!isValidCodeChallengeS256(codeChallenge)) {
			return fail(400, { error: 'Invalid code_challenge format' });
		}

		const sessionId = parseSessionCookie(request.headers.get('cookie'));
		if (!sessionId) {
			return fail(401, { error: 'Not authenticated' });
		}

		const sessionData = await getSessionWithUser(sessionId);
		if (!sessionData) {
			return fail(401, { error: 'Invalid session' });
		}

		const userId = sessionData.user.id;

		if (isUrlClientId(clientId)) {
			let metadata;
			try {
				metadata = await fetchClientIdMetadata(clientId);
			} catch {
				return fail(400, { error: 'Invalid client' });
			}

			const normalizedRedirect = redirectUri.replace(/\/$/, '');
			const validRedirect = metadata.redirect_uris.some(
				(uri) => uri.replace(/\/$/, '') === normalizedRedirect
			);

			if (!validRedirect) {
				return fail(400, { error: 'Invalid redirect_uri for this client' });
			}

			try {
				await ensureUrlClientInDb(clientId, metadata);
				await createAuthorization(userId, clientId);

				const code = await createAuthorizationCode(userId, clientId, redirectUri, codeChallenge);

				const callbackUrl = new URL(redirectUri);
				callbackUrl.searchParams.set('code', code);
				callbackUrl.searchParams.set('state', state);

				throw redirect(302, callbackUrl.toString());
			} catch (error) {
				if (isRedirect(error)) throw error;
				console.error('Failed to approve authorization:', error);
				return fail(500, { error: 'Failed to complete authorization' });
			}
		}

		const client = await getOAuthClient(clientId);
		if (!client) {
			return fail(400, { error: 'Invalid client' });
		}

		if (!validateRedirectUri(client, redirectUri)) {
			return fail(400, { error: 'Invalid redirect_uri for this client' });
		}

		try {
			await createAuthorization(userId, clientId);

			const code = await createAuthorizationCode(userId, clientId, redirectUri, codeChallenge);

			const callbackUrl = new URL(redirectUri);
			callbackUrl.searchParams.set('code', code);
			callbackUrl.searchParams.set('state', state);

			throw redirect(302, callbackUrl.toString());
		} catch (error) {
			if (isRedirect(error)) throw error;
			console.error('Failed to approve authorization:', error);
			return fail(500, { error: 'Failed to complete authorization' });
		}
	},

	deny: async ({ request }) => {
		const formData = await request.formData();
		const clientId = formData.get('client_id')?.toString();
		const redirectUri = formData.get('redirect_uri')?.toString();
		const state = formData.get('state')?.toString();

		if (clientId && redirectUri && state) {
			if (isUrlClientId(clientId)) {
				let metadata;
				try {
					metadata = await fetchClientIdMetadata(clientId);
				} catch {
					throw redirect(302, '/');
				}

				const normalizedRedirect = redirectUri.replace(/\/$/, '');
				const validRedirect = metadata.redirect_uris.some(
					(uri) => uri.replace(/\/$/, '') === normalizedRedirect
				);

				if (validRedirect) {
					const callbackUrl = new URL(redirectUri);
					callbackUrl.searchParams.set('error', 'access_denied');
					callbackUrl.searchParams.set('error_description', 'User denied authorization');
					callbackUrl.searchParams.set('state', state);

					throw redirect(302, callbackUrl.toString());
				}
			} else {
				const client = await getOAuthClient(clientId);
				if (client && validateRedirectUri(client, redirectUri)) {
					const callbackUrl = new URL(redirectUri);
					callbackUrl.searchParams.set('error', 'access_denied');
					callbackUrl.searchParams.set('error_description', 'User denied authorization');
					callbackUrl.searchParams.set('state', state);

					throw redirect(302, callbackUrl.toString());
				}
			}
		}

		throw redirect(302, '/');
	}
} satisfies Actions;
