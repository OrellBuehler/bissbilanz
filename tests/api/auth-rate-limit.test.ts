import { describe, test, expect, vi, beforeEach } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const sentry = vi.hoisted(() => ({
	captureException: vi.fn(),
	captureMessage: vi.fn(),
	addBreadcrumb: vi.fn(),
	logger: { error: vi.fn() }
}));
vi.mock('@sentry/sveltekit', () => sentry);

vi.mock('$lib/server/client-ip', () => ({ getRequestIp: () => '203.0.113.9' }));
vi.mock('$lib/server/rate-limit', () => ({
	rateLimit: () => {
		throw new Error('Rate limit exceeded');
	}
}));
vi.mock('$lib/server/env', () => ({
	config: { app: { url: 'http://localhost:5173', secureCookies: false } }
}));
vi.mock('$lib/server/auth-providers', () => ({
	getProvider: () => ({ id: 'infomaniak', responseMode: 'form_post' })
}));
vi.mock('$lib/server/oidc', () => ({}));
vi.mock('$lib/server/oidc-cookies', () => ({}));
vi.mock('$lib/server/oidc-jwt', () => ({}));
vi.mock('$lib/server/oidc-validate', () => ({}));
vi.mock('$lib/server/auth-account', () => ({}));
vi.mock('$lib/server/auth-transactions', () => ({}));
vi.mock('$lib/server/mobile-auth', () => ({}));
vi.mock('$lib/server/session', () => ({}));
vi.mock('$lib/server/security', () => ({ assertSameOrigin: () => {} }));

const { GET: loginGET } = await import('../../src/routes/api/auth/login/+server');
const { GET: mobileLoginGET } = await import('../../src/routes/api/auth/mobile/login/+server');
const { POST: logoutPOST } = await import('../../src/routes/api/auth/logout/+server');
const { handleWebCallback, handleFormPostCallback, handleMobileCallback } =
	await import('../../src/lib/server/auth-callback');

const rejection = async (run: () => unknown) => {
	try {
		await run();
	} catch (err) {
		return err;
	}
	throw new Error('expected the route to throw');
};

const expectTooManyRequests = (err: unknown) => {
	expect(isHttpError(err) && err.status).toBe(429);
	expect(sentry.captureException).not.toHaveBeenCalled();
	expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
		expect.objectContaining({ category: 'rate-limit' })
	);
};

const callbackInput = {
	providerId: 'infomaniak',
	code: 'code',
	state: 'state',
	appleUserField: null,
	cookies: {} as never,
	request: new Request('http://localhost:5173/api/auth/callback'),
	clientAddress: '203.0.113.9'
};

describe('rate-limited auth flows', () => {
	beforeEach(() => {
		sentry.captureException.mockClear();
		sentry.addBreadcrumb.mockClear();
	});

	test('GET /api/auth/login', async () => {
		const url = new URL('http://localhost:5173/api/auth/login');
		const err = await rejection(() =>
			loginGET({
				url,
				cookies: {},
				locals: {},
				request: new Request(url)
			} as unknown as Parameters<typeof loginGET>[0])
		);
		expectTooManyRequests(err);
	});

	test('GET /api/auth/mobile/login', async () => {
		const url = new URL('http://localhost:5173/api/auth/mobile/login?state=s');
		const err = await rejection(() =>
			mobileLoginGET({ url, request: new Request(url) } as unknown as Parameters<
				typeof mobileLoginGET
			>[0])
		);
		expectTooManyRequests(err);
	});

	test('POST /api/auth/logout', async () => {
		const err = await rejection(() =>
			logoutPOST({
				request: new Request('http://localhost:5173/api/auth/logout', { method: 'POST' }),
				cookies: { get: () => undefined }
			} as unknown as Parameters<typeof logoutPOST>[0])
		);
		expectTooManyRequests(err);
	});

	test('web callback', async () => {
		expectTooManyRequests(await rejection(() => handleWebCallback(callbackInput)));
	});

	test('form_post callback', async () => {
		expectTooManyRequests(await rejection(() => handleFormPostCallback(callbackInput)));
	});

	test('mobile callback', async () => {
		expectTooManyRequests(await rejection(() => handleMobileCallback(callbackInput)));
	});
});
