import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	verifyOAuthClient,
	getPublicOAuthClient,
	consumeAuthorizationCode,
	createAccessToken,
	refreshAccessToken,
	ACCESS_TOKEN_LIFETIME_MS,
	isValidCodeVerifier
} from '$lib/server/oauth';

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const grantType = formData.get('grant_type');
	const clientId = formData.get('client_id');
	const clientSecret = formData.get('client_secret');

	if (!grantType || typeof grantType !== 'string') {
		return json(
			{ error: 'invalid_request', error_description: 'Missing grant_type' },
			{ status: 400 }
		);
	}

	if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
		return json(
			{
				error: 'unsupported_grant_type',
				error_description: 'Supported grant types: authorization_code, refresh_token'
			},
			{ status: 400 }
		);
	}

	// Handle refresh_token grant
	if (grantType === 'refresh_token') {
		const refreshTokenValue = formData.get('refresh_token');
		if (
			!refreshTokenValue ||
			typeof refreshTokenValue !== 'string' ||
			!clientId ||
			typeof clientId !== 'string'
		) {
			return json(
				{ error: 'invalid_request', error_description: 'Missing refresh_token or client_id' },
				{ status: 400 }
			);
		}

		let client;
		if (clientSecret && typeof clientSecret === 'string') {
			client = await verifyOAuthClient(clientId, clientSecret);
		} else {
			client = await getPublicOAuthClient(clientId);
		}
		if (!client) {
			return json(
				{ error: 'invalid_client', error_description: 'Invalid client credentials' },
				{ status: 401 }
			);
		}

		const result = await refreshAccessToken(refreshTokenValue, clientId);
		if (!result) {
			return json(
				{ error: 'invalid_grant', error_description: 'Invalid or expired refresh token' },
				{ status: 400 }
			);
		}

		return json(
			{
				access_token: result.accessToken,
				token_type: 'Bearer',
				expires_in: Math.floor(ACCESS_TOKEN_LIFETIME_MS / 1000),
				refresh_token: result.refreshToken
			},
			{
				status: 200,
				headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' }
			}
		);
	}

	// authorization_code grant
	const code = formData.get('code');
	const redirectUri = formData.get('redirect_uri');
	const codeVerifier = formData.get('code_verifier');

	if (
		!code ||
		!redirectUri ||
		!clientId ||
		!codeVerifier ||
		typeof code !== 'string' ||
		typeof redirectUri !== 'string' ||
		typeof clientId !== 'string' ||
		typeof codeVerifier !== 'string'
	) {
		return json(
			{
				error: 'invalid_request',
				error_description: 'Missing or invalid required parameters'
			},
			{ status: 400 }
		);
	}

	if (!isValidCodeVerifier(codeVerifier)) {
		return json(
			{
				error: 'invalid_request',
				error_description:
					'Invalid code_verifier. Must be 43-128 characters, unreserved characters only (RFC 7636)'
			},
			{ status: 400 }
		);
	}

	let client;
	if (clientSecret && typeof clientSecret === 'string') {
		client = await verifyOAuthClient(clientId, clientSecret);
	} else {
		client = await getPublicOAuthClient(clientId);
	}

	if (!client) {
		return json(
			{ error: 'invalid_client', error_description: 'Invalid client credentials' },
			{ status: 401 }
		);
	}

	const userId = await consumeAuthorizationCode(code, clientId, redirectUri, codeVerifier);

	if (!userId) {
		return json(
			{
				error: 'invalid_grant',
				error_description: 'Invalid or expired authorization code, or PKCE verification failed'
			},
			{ status: 400 }
		);
	}

	const { accessToken, refreshToken } = await createAccessToken(userId, clientId);
	const expiresIn = Math.floor(ACCESS_TOKEN_LIFETIME_MS / 1000);

	return json(
		{
			access_token: accessToken,
			token_type: 'Bearer',
			expires_in: expiresIn,
			refresh_token: refreshToken
		},
		{
			status: 200,
			headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' }
		}
	);
};
