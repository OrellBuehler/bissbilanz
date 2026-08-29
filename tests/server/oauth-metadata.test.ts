import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/server/env', () => ({
	config: { app: { url: 'https://bissbilanz.example' } }
}));

import { GET as authorizationServer } from '../../src/routes/.well-known/oauth-authorization-server/+server';
import { GET as openidConfiguration } from '../../src/routes/.well-known/openid-configuration/+server';

const call = async (handler: (event: { url: URL }) => Promise<Response> | Response) => {
	const response = await handler({ url: new URL('https://bissbilanz.example/.well-known/x') });
	return response.json();
};

describe('OAuth discovery metadata', () => {
	test.each([
		['oauth-authorization-server', authorizationServer],
		['openid-configuration', openidConfiguration]
	])('%s does not advertise dynamic client registration', async (_name, handler) => {
		const body = await call(handler as never);
		expect(body.registration_endpoint).toBeUndefined();
		expect(body.authorization_endpoint).toBe('https://bissbilanz.example/api/oauth/authorize');
		expect(body.token_endpoint).toBe('https://bissbilanz.example/api/oauth/token');
		expect(body.code_challenge_methods_supported).toEqual(['S256']);
	});
});
