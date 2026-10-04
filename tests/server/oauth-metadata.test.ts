import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/server/env', () => ({
	config: { app: { url: 'https://bissbilanz.example' } }
}));

import { GET as authorizationServer } from '../../src/routes/.well-known/oauth-authorization-server/+server';
import { GET as openidConfiguration } from '../../src/routes/.well-known/openid-configuration/+server';
import { GET as protectedResourceMcp } from '../../src/routes/.well-known/oauth-protected-resource/api/mcp/+server';
import { GET as protectedResourceRoot } from '../../src/routes/.well-known/oauth-protected-resource/+server';

const call = async (handler: (event: { url: URL }) => Promise<Response> | Response) => {
	const response = await handler({ url: new URL('https://bissbilanz.example/.well-known/x') });
	return response.json();
};

describe('OAuth discovery metadata', () => {
	test.each([
		['oauth-authorization-server', authorizationServer],
		['openid-configuration', openidConfiguration]
	])('%s advertises CIMD instead of dynamic client registration', async (_name, handler) => {
		const body = await call(handler as never);
		expect(body.registration_endpoint).toBeUndefined();
		expect(body.client_id_metadata_document_supported).toBe(true);
		expect(body.token_endpoint_auth_methods_supported).toContain('none');
		expect(body.authorization_endpoint).toBe('https://bissbilanz.example/api/oauth/authorize');
		expect(body.token_endpoint).toBe('https://bissbilanz.example/api/oauth/token');
		expect(body.code_challenge_methods_supported).toEqual(['S256']);
	});

	test.each([
		['oauth-authorization-server', authorizationServer],
		['openid-configuration', openidConfiguration]
	])('%s supports RFC 9207 issuer identification and offline_access', async (_name, handler) => {
		const body = await call(handler as never);
		expect(body.authorization_response_iss_parameter_supported).toBe(true);
		expect(body.scopes_supported).toEqual(['mcp:access', 'offline_access']);
		expect(body.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
		expect(body.issuer).toBe('https://bissbilanz.example');
	});
});

describe('OAuth protected resource metadata', () => {
	test('the root route serves the same document as the /api/mcp variant', async () => {
		const root = await call(protectedResourceRoot as never);
		const mcp = await call(protectedResourceMcp as never);
		expect(root).toEqual(mcp);
		expect(root.resource).toBe('https://bissbilanz.example/api/mcp');
		expect(root.authorization_servers).toEqual(['https://bissbilanz.example']);
		expect(root.scopes_supported).toEqual(['mcp:access']);
	});
});
