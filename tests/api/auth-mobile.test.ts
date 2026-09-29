import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { isHttpError } from '@sveltejs/kit';
import { JOSEError } from 'jose/errors';
import { expectResponseContract } from '../helpers/contract';

// These two routes throw SvelteKit's error() helper directly instead of
// returning a Response, relying on the framework to catch it and build the
// response. Calling the handler function directly (as a unit test does)
// skips that framework step, so do it ourselves.
async function callRoute(
	handler: (event: any) => Response | Promise<Response>,
	event: unknown
): Promise<Response> {
	try {
		return await handler(event);
	} catch (err) {
		if (isHttpError(err)) {
			return Response.json(err.body, { status: err.status });
		}
		throw err;
	}
}

vi.mock('$lib/server/client-ip', () => ({ getRequestIp: () => '127.0.0.1' }));

let rateLimitError: Error | null = null;
vi.mock('$lib/server/rate-limit', () => ({
	rateLimit: () => {
		if (rateLimitError) throw rateLimitError;
	}
}));

vi.mock('$lib/server/oauth', () => ({
	createAccessToken: vi.fn(async () => ({
		accessToken: 'access-token',
		refreshToken: 'refresh-token'
	})),
	refreshAccessToken: vi.fn(
		async (token: string) =>
			(mockRefreshResult as Record<string, unknown> | undefined) &&
			(mockRefreshResult[token] ?? undefined)
	),
	FIRST_PARTY_SCOPES: ['mcp:access', 'account:manage'],
	ACCESS_TOKEN_LIFETIME_MS: 3_600_000
}));

let mockOneTimeCodeUser: string | undefined;
const consumeOneTimeCode = vi.fn((_code: string, _verifier?: string) => mockOneTimeCodeUser);
vi.mock('$lib/server/mobile-auth', () => ({
	consumeOneTimeCode: (code: string, verifier?: string) => consumeOneTimeCode(code, verifier),
	MOBILE_CLIENT_ID: 'bissbilanz-mobile'
}));

let mockRefreshResult: Record<
	string,
	{ accessToken: string; refreshToken: string; userId: string }
> = {};

const { POST: tokenPOST } = await import('../../src/routes/api/auth/mobile/token/+server');

const tokenEvent = (body: unknown) =>
	({
		request: new Request('http://localhost/api/auth/mobile/token', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		})
	}) as unknown as Parameters<typeof tokenPOST>[0];

describe('POST /api/auth/mobile/token', () => {
	beforeEach(() => {
		rateLimitError = null;
		mockOneTimeCodeUser = undefined;
		mockRefreshResult = {};
	});

	test('exchanges a valid code for a token pair', async () => {
		mockOneTimeCodeUser = 'user-1';
		const response = await callRoute(tokenPOST, tokenEvent({ code: 'a-code' }));
		await expectResponseContract('POST', '/api/auth/mobile/token', response);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({
			access_token: 'access-token',
			refresh_token: 'refresh-token',
			token_type: 'Bearer',
			expires_in: 3600
		});
	});

	test('exchanges a valid refresh token for a new token pair', async () => {
		mockRefreshResult = {
			'good-refresh': { accessToken: 'new-access', refreshToken: 'new-refresh', userId: 'user-1' }
		};
		const response = await callRoute(tokenPOST, tokenEvent({ refresh_token: 'good-refresh' }));
		await expectResponseContract('POST', '/api/auth/mobile/token', response);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.access_token).toBe('new-access');
	});

	test('passes the PKCE verifier through to the code check', async () => {
		mockOneTimeCodeUser = 'user-1';
		const response = await callRoute(
			tokenPOST,
			tokenEvent({ code: 'a-code', code_verifier: 'v'.repeat(43) })
		);
		await expectResponseContract('POST', '/api/auth/mobile/token', response);
		expect(response.status).toBe(200);
		expect(consumeOneTimeCode).toHaveBeenLastCalledWith('a-code', 'v'.repeat(43));
	});

	test('still accepts a code request without a verifier (older builds)', async () => {
		mockOneTimeCodeUser = 'user-1';
		const response = await callRoute(tokenPOST, tokenEvent({ code: 'a-code' }));
		expect(response.status).toBe(200);
		expect(consumeOneTimeCode).toHaveBeenLastCalledWith('a-code', undefined);
	});

	test('rejects a code that fails its PKCE check', async () => {
		mockOneTimeCodeUser = undefined;
		const response = await callRoute(
			tokenPOST,
			tokenEvent({ code: 'a-code', code_verifier: 'wrong'.repeat(9) })
		);
		await expectResponseContract('POST', '/api/auth/mobile/token', response);
		expect(response.status).toBe(400);
	});

	test('rejects a body with neither code nor refresh_token', async () => {
		const response = await callRoute(tokenPOST, tokenEvent({}));
		await expectResponseContract('POST', '/api/auth/mobile/token', response);
		expect(response.status).toBe(400);
	});

	test('rejects invalid JSON', async () => {
		const response = await callRoute(tokenPOST, tokenEvent('not json'));
		await expectResponseContract('POST', '/api/auth/mobile/token', response);
		expect(response.status).toBe(400);
	});

	test('rejects an unknown or expired code', async () => {
		mockOneTimeCodeUser = undefined;
		const response = await callRoute(tokenPOST, tokenEvent({ code: 'stale-code' }));
		await expectResponseContract('POST', '/api/auth/mobile/token', response);
		expect(response.status).toBe(400);
	});

	test('rejects an invalid or expired refresh token', async () => {
		const response = await callRoute(tokenPOST, tokenEvent({ refresh_token: 'bad-refresh' }));
		await expectResponseContract('POST', '/api/auth/mobile/token', response);
		expect(response.status).toBe(401);
	});

	test('rejects once the rate limit is exceeded', async () => {
		rateLimitError = new Error('Too many requests');
		const response = await callRoute(tokenPOST, tokenEvent({ code: 'a-code' }));
		await expectResponseContract('POST', '/api/auth/mobile/token', response);
		expect(response.status).toBe(429);
	});
});

vi.mock('$lib/server/env', () => ({
	config: { apple: { bundleId: 'com.bissbilanz.ios' } }
}));

let mockAppleConfig: unknown = { servicesId: 's', teamId: 't', keyId: 'k', privateKey: 'p' };
vi.mock('$lib/server/apple-secret', () => ({
	appleConfig: () => mockAppleConfig
}));

vi.mock('$lib/server/auth-account', () => ({
	findOrCreateUserByIdentity: vi.fn(async () => ({ id: 'u1' }))
}));

const verifyIdToken = vi.fn();
vi.mock('$lib/server/oidc-jwt', () => ({
	verifyIdToken: (...args: unknown[]) => verifyIdToken(...args)
}));

const { POST: applePOST } = await import('../../src/routes/api/auth/mobile/apple/+server');

const appleEvent = (body: unknown) =>
	({
		request: new Request('http://localhost/api/auth/mobile/apple', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		})
	}) as unknown as Parameters<typeof applePOST>[0];

describe('POST /api/auth/mobile/apple', () => {
	beforeEach(() => {
		rateLimitError = null;
		mockAppleConfig = { servicesId: 's', teamId: 't', keyId: 'k', privateKey: 'p' };
		verifyIdToken.mockReset();
	});

	test('verifies the identity token and mints a token pair', async () => {
		verifyIdToken.mockResolvedValueOnce({ sub: 'apple-sub', email: 'a@b.c' });
		const raw = 'raw-nonce-value';
		const response = await callRoute(applePOST, appleEvent({ identity_token: 'jwt', nonce: raw }));
		await expectResponseContract('POST', '/api/auth/mobile/apple', response);
		expect(response.status).toBe(200);
		expect(verifyIdToken).toHaveBeenCalledWith('jwt', {
			issuer: 'https://appleid.apple.com',
			audience: 'com.bissbilanz.ios',
			nonce: createHash('sha256').update(raw).digest('hex')
		});
		const data = await response.json();
		expect(data).toMatchObject({ access_token: 'access-token', refresh_token: 'refresh-token' });
	});

	test('rejects a body missing identity_token or nonce', async () => {
		const response = await callRoute(applePOST, appleEvent({ nonce: 'n' }));
		await expectResponseContract('POST', '/api/auth/mobile/apple', response);
		expect(response.status).toBe(400);
	});

	test('rejects when identity token verification fails', async () => {
		verifyIdToken.mockRejectedValueOnce(new JOSEError('signature verification failed'));
		const response = await callRoute(applePOST, appleEvent({ identity_token: 'bad', nonce: 'n' }));
		await expectResponseContract('POST', '/api/auth/mobile/apple', response);
		expect(response.status).toBe(401);
	});

	test('returns 404 when Sign in with Apple is not configured', async () => {
		mockAppleConfig = null;
		const response = await callRoute(applePOST, appleEvent({ identity_token: 'jwt', nonce: 'n' }));
		await expectResponseContract('POST', '/api/auth/mobile/apple', response);
		expect(response.status).toBe(404);
	});

	test('rejects once the rate limit is exceeded', async () => {
		rateLimitError = new Error('Too many requests');
		const response = await callRoute(applePOST, appleEvent({ identity_token: 'jwt', nonce: 'n' }));
		await expectResponseContract('POST', '/api/auth/mobile/apple', response);
		expect(response.status).toBe(429);
	});
});
