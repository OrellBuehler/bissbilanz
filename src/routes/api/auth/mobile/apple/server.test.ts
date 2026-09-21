import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('$lib/server/env', () => ({
	config: { apple: { bundleId: 'com.bissbilanz.ios' } }
}));
vi.mock('$lib/server/apple-secret', () => ({
	appleConfig: () => ({ servicesId: 's', teamId: 't', keyId: 'k', privateKey: 'p' })
}));
vi.mock('$lib/server/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('$lib/server/client-ip', () => ({ getRequestIp: () => '127.0.0.1' }));
vi.mock('$lib/server/auth-account', () => ({
	findOrCreateUserByIdentity: vi.fn(async () => ({ id: 'u1' }))
}));
vi.mock('$lib/server/oauth', () => ({
	createAccessToken: vi.fn(async () => ({ accessToken: 'at', refreshToken: 'rt' })),
	ACCESS_TOKEN_LIFETIME_MS: 3_600_000
}));

const verifyIdToken = vi.fn();
vi.mock('$lib/server/oidc-jwt', () => ({
	verifyIdToken: (...args: unknown[]) => verifyIdToken(...args)
}));

import { POST } from './+server';

const call = (body: unknown) =>
	POST({
		request: new Request('http://localhost/api/auth/mobile/apple', {
			method: 'POST',
			body: JSON.stringify(body)
		})
	} as unknown as Parameters<typeof POST>[0]);

describe('POST /api/auth/mobile/apple', () => {
	// Apple signs the SHA-256 the app put in the request into the token's nonce
	// claim; the app sends the raw nonce. Comparing them verbatim rejected every
	// native sign-in with 401 (reported on v1.45.1, 2026-09-20).
	it('verifies the token against the SHA-256 of the raw nonce', async () => {
		verifyIdToken.mockResolvedValueOnce({ sub: 'apple-sub', email: 'a@b.c' });
		const raw = 'raw-nonce-value';

		const res = await call({ identity_token: 'jwt', nonce: raw });

		expect(res.status).toBe(200);
		expect(verifyIdToken).toHaveBeenCalledWith('jwt', {
			issuer: 'https://appleid.apple.com',
			audience: 'com.bissbilanz.ios',
			nonce: createHash('sha256').update(raw).digest('hex')
		});
		expect(await res.json()).toMatchObject({ access_token: 'at', refresh_token: 'rt' });
	});
});
