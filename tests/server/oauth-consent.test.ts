import { describe, test, expect, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

vi.mock('$lib/server/env', () => ({
	config: { app: { url: 'https://bissbilanz.example' } }
}));
vi.mock('$lib/server/session', () => ({
	parseSessionCookie: (cookie: string | null) => (cookie ? 'session-id' : null),
	getSessionWithUser: async () => ({ user: { id: 'user-1' } })
}));

let validRedirect = true;
let failCreate = false;
vi.mock('$lib/server/oauth', () => ({
	createAuthorization: async () => {
		if (failCreate) throw new Error('db down');
	},
	createAuthorizationCode: async () => 'the-code',
	validateRedirectUri: () => validRedirect,
	isValidCodeChallengeS256: () => true,
	isLoopbackRedirectUri: () => false
}));
vi.mock('$lib/server/oauth-cimd', () => ({
	resolveOAuthClient: async () => ({ clientId: 'c', clientName: 'Claude' }),
	isClientIdMetadataUrl: () => true
}));

const { actions } = await import('../../src/routes/oauth/consent/+page.server');

const form = (values: Record<string, string>) => {
	const fd = new FormData();
	for (const [key, value] of Object.entries(values)) fd.append(key, value);
	return new Request('https://bissbilanz.example/oauth/consent', {
		method: 'POST',
		body: fd,
		headers: { cookie: 'session=abc' }
	});
};

const base = {
	client_id: 'https://claude.ai/client.json',
	redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
	state: 'xyz',
	code_challenge: 'challenge',
	code_challenge_method: 'S256'
};

const run = async (action: 'approve' | 'deny', values: Record<string, string>) => {
	try {
		const result = await actions[action]({
			request: form(values),
			url: new URL('http://localhost:5173/oauth/consent')
		} as never);
		return { result };
	} catch (err) {
		if (isRedirect(err)) return { location: new URL(err.location, 'http://localhost') };
		throw err;
	}
};

describe('oauth consent actions', () => {
	test('approve adds the RFC 9207 issuer to the authorization response', async () => {
		validRedirect = true;
		const { location } = await run('approve', base);
		expect(location?.origin).toBe('https://claude.ai');
		expect(location?.searchParams.get('code')).toBe('the-code');
		expect(location?.searchParams.get('state')).toBe('xyz');
		expect(location?.searchParams.get('iss')).toBe('https://bissbilanz.example');
	});

	test('deny adds the RFC 9207 issuer to the error response', async () => {
		validRedirect = true;
		const { location } = await run('deny', base);
		expect(location?.origin).toBe('https://claude.ai');
		expect(location?.searchParams.get('error')).toBe('access_denied');
		expect(location?.searchParams.get('state')).toBe('xyz');
		expect(location?.searchParams.get('iss')).toBe('https://bissbilanz.example');
	});

	test('deny with an unregistered redirect goes home without leaking to the client', async () => {
		validRedirect = false;
		const { location } = await run('deny', base);
		expect(location?.pathname).toBe('/');
		expect(location?.searchParams.get('iss')).toBeNull();
	});

	test('approve surfaces storage failures as a 500', async () => {
		validRedirect = true;
		failCreate = true;
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { result } = await run('approve', base);
		failCreate = false;
		expect(result).toMatchObject({ status: 500 });
	});
});
