import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { config } from '$lib/server/env';

const REQUIRED_SCOPE = 'mcp:access';

function getBaseUrl(url: URL): string {
	const base = config.app.url || url.origin;
	return base.replace(/\/$/, '');
}

export const GET: RequestHandler = async ({ url }) => {
	const baseUrl = getBaseUrl(url);

	return json({
		issuer: baseUrl,
		authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
		token_endpoint: `${baseUrl}/api/oauth/token`,
		registration_endpoint: `${baseUrl}/api/oauth/register`,
		client_id_metadata_document_supported: true,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
		code_challenge_methods_supported: ['S256'],
		scopes_supported: [REQUIRED_SCOPE]
	});
};
