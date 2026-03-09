import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDB, oauthClients } from '$lib/server/db';
import { generateClientId, generateClientSecret, hashToken } from '$lib/server/oauth';
import { rateLimitRegistration } from '$lib/server/rate-limit';

function isValidRedirectUriFormat(uri: string): boolean {
	try {
		const url = new URL(uri);
		if (url.protocol === 'https:') return true;
		if (url.protocol === 'http:') {
			return (
				url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
			);
		}
		if (/^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && url.protocol !== 'javascript:') {
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * RFC 7591 — OAuth 2.0 Dynamic Client Registration
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		rateLimitRegistration(getClientAddress());
	} catch {
		return json(
			{ error: 'too_many_requests', error_description: 'Rate limit exceeded' },
			{ status: 429 }
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json(
			{ error: 'invalid_client_metadata', error_description: 'Invalid JSON body' },
			{ status: 400 }
		);
	}

	if (!body || typeof body !== 'object') {
		return json(
			{
				error: 'invalid_client_metadata',
				error_description: 'Request body must be a JSON object'
			},
			{ status: 400 }
		);
	}

	const metadata = body as Record<string, unknown>;

	// Validate redirect_uris (required)
	const redirectUris = metadata.redirect_uris;
	if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
		return json(
			{
				error: 'invalid_redirect_uri',
				error_description: 'redirect_uris must be a non-empty array'
			},
			{ status: 400 }
		);
	}

	for (const uri of redirectUris) {
		if (typeof uri !== 'string' || !isValidRedirectUriFormat(uri)) {
			return json(
				{
					error: 'invalid_redirect_uri',
					error_description: `Invalid redirect URI: ${uri}. Must be HTTPS or localhost.`
				},
				{ status: 400 }
			);
		}
	}

	const normalizedUris = redirectUris.map((uri: string) => uri.replace(/\/$/, ''));

	// Validate grant_types
	const grantTypes = (metadata.grant_types as string[] | undefined) ?? ['authorization_code'];
	if (!Array.isArray(grantTypes) || !grantTypes.includes('authorization_code')) {
		return json(
			{
				error: 'invalid_client_metadata',
				error_description: 'grant_types must include "authorization_code"'
			},
			{ status: 400 }
		);
	}

	// Validate response_types
	const responseTypes = (metadata.response_types as string[] | undefined) ?? ['code'];
	if (!Array.isArray(responseTypes) || !responseTypes.includes('code')) {
		return json(
			{
				error: 'invalid_client_metadata',
				error_description: 'response_types must include "code"'
			},
			{ status: 400 }
		);
	}

	// Validate token_endpoint_auth_method
	const authMethod =
		(metadata.token_endpoint_auth_method as string | undefined) ?? 'client_secret_post';
	if (authMethod !== 'client_secret_post' && authMethod !== 'none') {
		return json(
			{
				error: 'invalid_client_metadata',
				error_description: 'token_endpoint_auth_method must be "client_secret_post" or "none"'
			},
			{ status: 400 }
		);
	}

	const clientName =
		typeof metadata.client_name === 'string' ? metadata.client_name.slice(0, 256) : null;

	const clientId = generateClientId();
	const isPublicClient = authMethod === 'none';
	const clientSecret = isPublicClient ? null : generateClientSecret();
	const clientSecretHash = clientSecret ? hashToken(clientSecret) : null;

	const db = getDB();
	await db.insert(oauthClients).values({
		userId: null,
		clientId,
		clientSecretHash,
		tokenEndpointAuthMethod: authMethod,
		clientName,
		allowedRedirectUris: normalizedUris
	});

	const issuedAt = Math.floor(Date.now() / 1000);

	const response: Record<string, unknown> = {
		client_id: clientId,
		client_id_issued_at: issuedAt,
		client_name: clientName,
		redirect_uris: normalizedUris,
		grant_types: ['authorization_code'],
		response_types: ['code'],
		token_endpoint_auth_method: authMethod
	};

	if (!isPublicClient) {
		response.client_secret = clientSecret;
		response.client_secret_expires_at = 0;
	}

	return json(response, { status: 201 });
};
