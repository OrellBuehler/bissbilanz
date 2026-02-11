import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

// Create mock DB
const { db, setResult, setError, reset } = createMockDB();

// Mock env
mock.module('$lib/server/env', () => ({
	config: {
		infomaniak: {
			clientId: 'test-client-id',
			clientSecret: 'test-client-secret',
			redirectUri: 'http://localhost:5173/api/auth/callback'
		},
		session: { secret: 'test-secret-32-bytes-long-string!' },
		app: { url: 'http://localhost:5173' }
	}
}));

// Mock db module
mock.module('$lib/server/db', () => {
	const { users, sessions } = require('$lib/server/schema');
	return {
		getDB: () => db,
		users,
		sessions
	};
});

// Mock session creation
const mockSession = { id: 'session-123', userId: TEST_USER.id, expiresAt: new Date() };
mock.module('$lib/server/session', () => ({
	createSession: mock(() => Promise.resolve(mockSession))
}));

// Mock OIDC validation
mock.module('$lib/server/oidc-validate', () => ({
	assertState: mock(() => {})
}));

// Mock JWT verification
mock.module('$lib/server/oidc-jwt', () => ({
	verifyIdToken: mock(() => Promise.resolve({ sub: '12345', email: 'test@example.com' }))
}));

// Mock rate limiting
mock.module('$lib/server/rate-limit', () => ({
	rateLimit: mock(() => {})
}));

// Import after mocking
const { GET } = await import('../../src/routes/api/auth/callback/+server');
const { assertState } = await import('$lib/server/oidc-validate');
const { rateLimit } = await import('$lib/server/rate-limit');

// Store original fetch
const originalFetch = globalThis.fetch;

// Token and userinfo response factories
const makeTokenResponse = () =>
	new Response(
		JSON.stringify({
			access_token: 'access-token',
			refresh_token: 'refresh-token',
			id_token: 'id-token',
			token_type: 'Bearer',
			expires_in: 3600
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	);

const makeUserInfoResponse = () =>
	new Response(
		JSON.stringify({
			sub: '12345',
			email: 'test@example.com',
			name: 'Test User',
			picture: 'https://example.com/avatar.jpg'
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	);

// Helper to create callback event
function createCallbackEvent(options: {
	code?: string | null;
	state?: string;
	cookies?: Record<string, string>;
}) {
	const {
		code = 'auth-code-123',
		state = 'valid-state',
		cookies = {
			oidc_state: 'valid-state',
			oidc_nonce: 'valid-nonce',
			oidc_verifier: 'valid-verifier'
		}
	} = options;

	const url = new URL('http://localhost:5173/api/auth/callback');
	if (code) url.searchParams.set('code', code);
	if (state) url.searchParams.set('state', state);

	const deletedCookies: string[] = [];
	const setCookies: Array<{ name: string; value: string }> = [];

	return {
		url,
		request: new Request(url),
		cookies: {
			get: (name: string) => cookies[name],
			set: (name: string, value: string) => setCookies.push({ name, value }),
			delete: (name: string) => deletedCookies.push(name),
			serialize: () => ''
		},
		getClientAddress: () => '127.0.0.1',
		locals: {},
		params: {},
		platform: undefined,
		route: { id: '/api/auth/callback' },
		setHeaders: () => {},
		isDataRequest: false,
		isSubRequest: false,
		deletedCookies,
		setCookies
	};
}

describe('Auth callback flow', () => {
	beforeEach(() => {
		reset();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test('successful callback redirects to /app', async () => {
		setResult([TEST_USER]);

		let fetchCallCount = 0;
		globalThis.fetch = (async () => {
			fetchCallCount++;
			if (fetchCallCount === 1) return makeTokenResponse();
			return makeUserInfoResponse();
		}) as typeof fetch;

		const event = createCallbackEvent({});

		try {
			await GET(event as any);
			expect(true).toBe(false);
		} catch (e: any) {
			expect(e.status).toBe(302);
			expect(e.location).toBe('/app');
		}
	});

	test('sets session cookie on successful login', async () => {
		setResult([TEST_USER]);

		let fetchCallCount = 0;
		globalThis.fetch = (async () => {
			fetchCallCount++;
			if (fetchCallCount === 1) return makeTokenResponse();
			return makeUserInfoResponse();
		}) as typeof fetch;

		const event = createCallbackEvent({});

		try {
			await GET(event as any);
		} catch {
			// Expected redirect
		}

		expect(event.setCookies.some((c) => c.name === 'session')).toBe(true);
	});

	test('clears OIDC cookies after callback', async () => {
		setResult([TEST_USER]);

		let fetchCallCount = 0;
		globalThis.fetch = (async () => {
			fetchCallCount++;
			if (fetchCallCount === 1) return makeTokenResponse();
			return makeUserInfoResponse();
		}) as typeof fetch;

		const event = createCallbackEvent({});

		try {
			await GET(event as any);
		} catch {
			// Expected redirect
		}

		expect(event.deletedCookies).toContain('oidc_state');
		expect(event.deletedCookies).toContain('oidc_nonce');
		expect(event.deletedCookies).toContain('oidc_verifier');
	});

	test('throws 400 when authorization code is missing', async () => {
		const event = createCallbackEvent({ code: null });

		try {
			await GET(event as any);
			expect(true).toBe(false);
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	test('validates OIDC state parameter', async () => {
		setResult([TEST_USER]);

		let fetchCallCount = 0;
		globalThis.fetch = (async () => {
			fetchCallCount++;
			if (fetchCallCount === 1) return makeTokenResponse();
			return makeUserInfoResponse();
		}) as typeof fetch;

		const event = createCallbackEvent({});

		try {
			await GET(event as any);
		} catch {
			// Expected redirect
		}

		expect(assertState).toHaveBeenCalled();
	});

	test('throws 500 when token exchange fails', async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ error: 'invalid_grant' }), {
				status: 400
			})) as typeof fetch;

		const event = createCallbackEvent({});

		try {
			await GET(event as any);
			expect(true).toBe(false);
		} catch (e: any) {
			expect(e.status).toBe(500);
		}
	});

	test('throws 500 when userinfo fetch fails', async () => {
		let fetchCallCount = 0;
		globalThis.fetch = (async () => {
			fetchCallCount++;
			if (fetchCallCount === 1) return makeTokenResponse();
			return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
		}) as typeof fetch;

		const event = createCallbackEvent({});

		try {
			await GET(event as any);
			expect(true).toBe(false);
		} catch (e: any) {
			expect(e.status).toBe(500);
		}
	});

	test('rate limits callback requests', async () => {
		setResult([TEST_USER]);

		let fetchCallCount = 0;
		globalThis.fetch = (async () => {
			fetchCallCount++;
			if (fetchCallCount === 1) return makeTokenResponse();
			return makeUserInfoResponse();
		}) as typeof fetch;

		const event = createCallbackEvent({});

		try {
			await GET(event as any);
		} catch {
			// Expected
		}

		expect(rateLimit).toHaveBeenCalled();
	});
});
