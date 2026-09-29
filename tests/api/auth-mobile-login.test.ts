import { describe, test, expect, vi, beforeEach } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';

vi.mock('$lib/server/client-ip', () => ({ getRequestIp: () => '127.0.0.1' }));
vi.mock('$lib/server/rate-limit', () => ({ rateLimit: () => {} }));
vi.mock('$lib/server/auth-providers', () => ({
	getProvider: (id: string) =>
		id === 'infomaniak' ? { id: 'infomaniak', mobileRedirectUri: 'x://cb' } : undefined
}));
vi.mock('$lib/server/oidc', () => ({
	generateCodeVerifier: () => 'provider-verifier',
	createCodeChallenge: async () => 'provider-challenge',
	generateNonce: () => 'nonce',
	buildAuthorizeUrl: () => 'https://idp.example/authorize'
}));

const storePendingState = vi.fn();
vi.mock('$lib/server/mobile-auth', () => ({
	storePendingState: (...args: unknown[]) => storePendingState(...args)
}));

const { GET } = await import('../../src/routes/api/auth/mobile/login/+server');

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

async function login(query: string) {
	const url = new URL(`http://localhost/api/auth/mobile/login?${query}`);
	try {
		await GET({ url, request: new Request(url) } as unknown as Parameters<typeof GET>[0]);
	} catch (err) {
		if (isRedirect(err)) return { redirect: err.location };
		if (isHttpError(err)) return { status: err.status };
		throw err;
	}
	throw new Error('expected the route to throw');
}

describe('GET /api/auth/mobile/login', () => {
	beforeEach(() => storePendingState.mockClear());

	test('keeps the app PKCE challenge with the pending state', async () => {
		const result = await login(`state=s1&code_challenge=${CHALLENGE}&code_challenge_method=S256`);
		expect(result.redirect).toBe('https://idp.example/authorize');
		expect(storePendingState).toHaveBeenCalledWith(
			's1',
			'provider-verifier',
			'nonce',
			'infomaniak',
			CHALLENGE
		);
	});

	test('defaults the method to S256 when only a challenge is sent', async () => {
		const result = await login(`state=s1&code_challenge=${CHALLENGE}`);
		expect(result.redirect).toBeDefined();
	});

	test('still starts a flow without a challenge (older builds)', async () => {
		const result = await login('state=s1');
		expect(result.redirect).toBe('https://idp.example/authorize');
		expect(storePendingState).toHaveBeenCalledWith(
			's1',
			'provider-verifier',
			'nonce',
			'infomaniak',
			undefined
		);
	});

	test('rejects a malformed challenge or a non-S256 method', async () => {
		expect((await login('state=s1&code_challenge=too-short')).status).toBe(400);
		expect(
			(await login(`state=s1&code_challenge=${CHALLENGE}&code_challenge_method=plain`)).status
		).toBe(400);
		expect(storePendingState).not.toHaveBeenCalled();
	});

	test('still requires a state', async () => {
		expect((await login(`code_challenge=${CHALLENGE}`)).status).toBe(400);
	});
});
