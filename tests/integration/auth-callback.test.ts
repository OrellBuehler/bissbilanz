import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

// Create mock DB
const { db, setResult, setError, reset } = createMockDB();

// Mock env
vi.mock('$lib/server/env', () => ({
	parseDatabaseConfig: () => ({ host: 'localhost', port: 5432, database: 'test', user: 'test' }),
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

// Mock db module — spread all schema exports to avoid polluting other test files
vi.mock('$lib/server/db', async () => {
	const schema = await vi.importActual<typeof import('$lib/server/schema')>('$lib/server/schema');
	return {
		getDB: () => db,
		runMigrations: async () => {},
		...schema
	};
});

// Mock session — must export all names to avoid polluting other test files via mock.module.
const mockSession = { id: 'session-123', userId: TEST_USER.id, expiresAt: new Date() };
vi.mock('$lib/server/session', () => ({
	generateSessionId: () => 'mock-session-id',
	createSession: vi.fn(() => Promise.resolve(mockSession)),
	getSession: vi.fn(() => Promise.resolve(null)),
	getSessionWithUser: vi.fn(() => Promise.resolve(null)),
	deleteSession: vi.fn(() => Promise.resolve()),
	deleteUserSessions: vi.fn(() => Promise.resolve()),
	cleanExpiredSessions: vi.fn(() => Promise.resolve(0)),
	createSessionCookie: vi.fn(
		() => 'session=mock; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=604800'
	),
	clearSessionCookie: vi.fn(() => 'session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0'),
	parseSessionCookie: vi.fn(() => null)
}));

// Mock OIDC validation — must include all exports
vi.mock('$lib/server/oidc-validate', () => ({
	assertState: vi.fn(() => {}),
	assertNonce: vi.fn(() => {}),
	decodeIdToken: vi.fn(() => ({}))
}));

// Mock JWT verification — must include all exports
vi.mock('$lib/server/oidc-jwt', () => ({
	verifyIdToken: vi.fn(() => Promise.resolve({ sub: '12345', email: 'test@example.com' })),
	assertClaims: vi.fn(() => {})
}));

// Mock rate limiting
vi.mock('$lib/server/rate-limit', () => ({
	rateLimit: vi.fn(() => {})
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

	test('successful callback redirects to /', async () => {
		setResult([TEST_USER]);

		let fetchCallCount = 0;
		globalThis.fetch = (async () => {
			fetchCallCount++;
			if (fetchCallCount === 1) return makeTokenResponse();
			return makeUserInfoResponse();
		}) as unknown as typeof fetch;

		const event = createCallbackEvent({});

		try {
			await GET(event as any);
			expect(true).toBe(false);
		} catch (e: any) {
			expect(e.status).toBe(302);
			expect(e.location).toBe('/');
		}
	});

	test('sets session cookie on successful login', async () => {
		setResult([TEST_USER]);

		let fetchCallCount = 0;
		globalThis.fetch = (async () => {
			fetchCallCount++;
			if (fetchCallCount === 1) return makeTokenResponse();
			return makeUserInfoResponse();
		}) as unknown as typeof fetch;

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
		}) as unknown as typeof fetch;

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
		}) as unknown as typeof fetch;

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
			})) as unknown as typeof fetch;

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
		}) as unknown as typeof fetch;

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
		}) as unknown as typeof fetch;

		const event = createCallbackEvent({});

		try {
			await GET(event as any);
		} catch {
			// Expected
		}

		expect(rateLimit).toHaveBeenCalled();
	});
});
