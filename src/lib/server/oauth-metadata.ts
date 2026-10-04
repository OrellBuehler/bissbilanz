import { config } from '$lib/server/env';

export const MCP_SCOPE = 'mcp:access';
export const OFFLINE_ACCESS_SCOPE = 'offline_access';

export function getIssuer(url: URL): string {
	const base = config.app.url || url.origin;
	return base.replace(/\/$/, '');
}

export function authorizationServerMetadata(url: URL) {
	const baseUrl = getIssuer(url);
	return {
		issuer: baseUrl,
		authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
		token_endpoint: `${baseUrl}/api/oauth/token`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
		code_challenge_methods_supported: ['S256'],
		client_id_metadata_document_supported: true,
		authorization_response_iss_parameter_supported: true,
		scopes_supported: [MCP_SCOPE, OFFLINE_ACCESS_SCOPE]
	};
}

export function protectedResourceMetadata(url: URL) {
	const baseUrl = getIssuer(url);
	return {
		resource: `${baseUrl}/api/mcp`,
		authorization_servers: [baseUrl],
		scopes_supported: [MCP_SCOPE],
		bearer_methods_supported: ['header'],
		resource_name: 'Bissbilanz MCP'
	};
}
