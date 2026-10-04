import { describe, test, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

vi.mock('$lib/server/env', () => ({
	config: { app: { url: 'https://bissbilanz.example/' } }
}));
vi.mock('$lib/server/client-ip', () => ({ getRequestIp: () => '203.0.113.9' }));
vi.mock('$lib/server/rate-limit', () => ({ rateLimit: () => undefined }));
vi.mock('$lib/server/session', () => ({
	parseSessionCookie: (cookie: string | null) => (cookie ? 'session-id' : null),
	getSessionWithUser: async () => ({ user: { id: 'user-1' } })
}));

let authorized = true;
vi.mock('$lib/server/oauth', () => ({
	hasAuthorization: async () => authorized,
	createAuthorizationCode: async () => 'the-code',
	validateRedirectUri: () => true,
	isValidCodeChallengeS256: () => true,
	isValidRedirectUriFormat: () => true
}));
vi.mock('$lib/server/oauth-cimd', () => ({
	resolveOAuthClient: async () => ({ clientId: 'c', clientName: 'Claude' })
}));

const { GET } = await import('../../src/routes/api/oauth/authorize/+server');

const call = async (scope?: string) => {
	const url = new URL('http://localhost/api/oauth/authorize');
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', 'https://claude.ai/client.json');
	url.searchParams.set('redirect_uri', 'https://claude.ai/api/mcp/auth_callback');
	url.searchParams.set('state', 'xyz');
	url.searchParams.set('code_challenge', 'challenge');
	url.searchParams.set('code_challenge_method', 'S256');
	if (scope) url.searchParams.set('scope', scope);
	try {
		await GET({
			url,
			request: new Request(url, { headers: { cookie: 'session=abc' } })
		} as unknown as Parameters<typeof GET>[0]);
	} catch (err) {
		if (isRedirect(err)) return new URL(err.location);
		throw err;
	}
	throw new Error('expected a redirect');
};

describe('GET /api/oauth/authorize', () => {
	beforeEach(() => {
		authorized = true;
	});

	test('adds the RFC 9207 issuer to the authorization response', async () => {
		const location = await call();
		expect(location.origin + location.pathname).toBe('https://claude.ai/api/mcp/auth_callback');
		expect(location.searchParams.get('code')).toBe('the-code');
		expect(location.searchParams.get('state')).toBe('xyz');
		expect(location.searchParams.get('iss')).toBe('https://bissbilanz.example');
	});

	test('accepts offline_access in the requested scope', async () => {
		const location = await call('mcp:access offline_access');
		expect(location.searchParams.get('code')).toBe('the-code');
		expect(location.searchParams.get('iss')).toBe('https://bissbilanz.example');
	});

	test('sends unauthorized clients to the consent page', async () => {
		authorized = false;
		const location = await call('offline_access');
		expect(location.pathname).toBe('/oauth/consent');
		expect(location.searchParams.get('iss')).toBeNull();
	});
});
