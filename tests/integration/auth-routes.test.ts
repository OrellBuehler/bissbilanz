import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_SESSION } from '../helpers/fixtures';

// Create mock DB
const { db, setResult, reset } = createMockDB();

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

// Mock db
mock.module('$lib/server/db', () => {
	const schema = require('$lib/server/schema');
	return {
		getDB: () => db,
		...Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, v]))
	};
});

// Mock rate limiting
mock.module('$lib/server/rate-limit', () => ({
	rateLimit: mock(() => {})
}));

// Mock session functions
const mockDeleteSession = mock(() => Promise.resolve());
const mockGetSessionWithUser = mock(() =>
	Promise.resolve({ session: TEST_SESSION, user: TEST_USER })
);
mock.module('$lib/server/session', () => ({
	deleteSession: mockDeleteSession,
	getSessionWithUser: mockGetSessionWithUser
}));

// Mock security
mock.module('$lib/server/security', () => ({
	assertSameOrigin: mock(() => {})
}));

// Mock OIDC
mock.module('$lib/server/oidc', () => ({
	generateState: () => 'mock-state',
	generateNonce: () => 'mock-nonce',
	generateCodeVerifier: () => 'mock-verifier',
	createCodeChallenge: () => Promise.resolve('mock-challenge'),
	buildAuthorizeUrl: (input: any) =>
		`https://login.infomaniak.com/authorize?client_id=${input.clientId}`
}));

mock.module('$lib/server/oidc-cookies', () => ({
	oidcCookieOptions: (secure: boolean) => ({
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		maxAge: 600
	})
}));

// Import after mocking
const loginModule = await import('../../src/routes/api/auth/login/+server');
const logoutModule = await import('../../src/routes/api/auth/logout/+server');
const meModule = await import('../../src/routes/api/auth/me/+server');

describe('Auth login route', () => {
	test('redirects to Infomaniak authorize URL', async () => {
		const setCookies: string[] = [];
		const event = {
			url: new URL('http://localhost:5173/api/auth/login'),
			cookies: {
				get: () => undefined,
				set: (name: string) => setCookies.push(name),
				delete: () => {},
				serialize: () => ''
			},
			getClientAddress: () => '127.0.0.1',
			request: new Request('http://localhost:5173/api/auth/login'),
			locals: {},
			params: {},
			platform: undefined,
			route: { id: '/api/auth/login' },
			setHeaders: () => {},
			isDataRequest: false,
			isSubRequest: false
		};

		try {
			await loginModule.GET(event as any);
			expect(true).toBe(false);
		} catch (e: any) {
			expect(e.status).toBe(302);
			expect(e.location).toContain('login.infomaniak.com/authorize');
		}
	});

	test('sets OIDC cookies (state, nonce, verifier)', async () => {
		const setCookies: string[] = [];
		const event = {
			url: new URL('http://localhost:5173/api/auth/login'),
			cookies: {
				get: () => undefined,
				set: (name: string) => setCookies.push(name),
				delete: () => {},
				serialize: () => ''
			},
			getClientAddress: () => '127.0.0.1',
			request: new Request('http://localhost:5173/api/auth/login'),
			locals: {},
			params: {},
			platform: undefined,
			route: { id: '/api/auth/login' },
			setHeaders: () => {},
			isDataRequest: false,
			isSubRequest: false
		};

		try {
			await loginModule.GET(event as any);
		} catch {
			// Expected redirect
		}

		expect(setCookies).toContain('oidc_state');
		expect(setCookies).toContain('oidc_nonce');
		expect(setCookies).toContain('oidc_verifier');
	});
});

describe('Auth logout route', () => {
	test('deletes session and redirects to /', async () => {
		const deletedCookies: string[] = [];
		const event = {
			request: new Request('http://localhost:5173/api/auth/logout', {
				method: 'POST',
				headers: { origin: 'http://localhost:5173' }
			}),
			cookies: {
				get: (name: string) => (name === 'session' ? 'session-123' : undefined),
				set: () => {},
				delete: (name: string) => deletedCookies.push(name),
				serialize: () => ''
			},
			getClientAddress: () => '127.0.0.1',
			locals: {},
			params: {},
			url: new URL('http://localhost:5173/api/auth/logout'),
			platform: undefined,
			route: { id: '/api/auth/logout' },
			setHeaders: () => {},
			isDataRequest: false,
			isSubRequest: false
		};

		try {
			await logoutModule.POST(event as any);
			expect(true).toBe(false);
		} catch (e: any) {
			expect(e.status).toBe(302);
			expect(e.location).toBe('/');
		}

		expect(deletedCookies).toContain('session');
		expect(mockDeleteSession).toHaveBeenCalled();
	});

	test('handles logout without existing session', async () => {
		const event = {
			request: new Request('http://localhost:5173/api/auth/logout', {
				method: 'POST',
				headers: { origin: 'http://localhost:5173' }
			}),
			cookies: {
				get: () => undefined,
				set: () => {},
				delete: () => {},
				serialize: () => ''
			},
			getClientAddress: () => '127.0.0.1',
			locals: {},
			params: {},
			url: new URL('http://localhost:5173/api/auth/logout'),
			platform: undefined,
			route: { id: '/api/auth/logout' },
			setHeaders: () => {},
			isDataRequest: false,
			isSubRequest: false
		};

		try {
			await logoutModule.POST(event as any);
		} catch (e: any) {
			// Should still redirect even without session
			expect(e.status).toBe(302);
			expect(e.location).toBe('/');
		}
	});
});

describe('Auth /me route', () => {
	beforeEach(() => {
		reset();
		mockGetSessionWithUser.mockReset();
	});

	test('returns user profile when authenticated', async () => {
		mockGetSessionWithUser.mockReturnValue(
			Promise.resolve({ session: TEST_SESSION, user: TEST_USER })
		);

		const event = {
			cookies: {
				get: (name: string) => (name === 'session' ? 'session-123' : undefined),
				set: () => {},
				delete: () => {},
				serialize: () => ''
			},
			request: new Request('http://localhost:5173/api/auth/me'),
			locals: {},
			params: {},
			url: new URL('http://localhost:5173/api/auth/me'),
			platform: undefined,
			route: { id: '/api/auth/me' },
			setHeaders: () => {},
			isDataRequest: false,
			isSubRequest: false
		};

		const response = await meModule.GET(event as any);
		const data = await response.json();

		expect(data.user).toBeTruthy();
		expect(data.user.id).toBe(TEST_USER.id);
		expect(data.user.email).toBe(TEST_USER.email);
		expect(data.user.name).toBe(TEST_USER.name);
	});

	test('returns null user when no session cookie', async () => {
		const event = {
			cookies: {
				get: () => undefined,
				set: () => {},
				delete: () => {},
				serialize: () => ''
			},
			request: new Request('http://localhost:5173/api/auth/me'),
			locals: {},
			params: {},
			url: new URL('http://localhost:5173/api/auth/me'),
			platform: undefined,
			route: { id: '/api/auth/me' },
			setHeaders: () => {},
			isDataRequest: false,
			isSubRequest: false
		};

		const response = await meModule.GET(event as any);
		const data = await response.json();

		expect(data.user).toBeNull();
	});

	test('returns null user when session is expired/invalid', async () => {
		mockGetSessionWithUser.mockReturnValue(Promise.resolve(null) as any);

		const event = {
			cookies: {
				get: (name: string) => (name === 'session' ? 'expired-session' : undefined),
				set: () => {},
				delete: () => {},
				serialize: () => ''
			},
			request: new Request('http://localhost:5173/api/auth/me'),
			locals: {},
			params: {},
			url: new URL('http://localhost:5173/api/auth/me'),
			platform: undefined,
			route: { id: '/api/auth/me' },
			setHeaders: () => {},
			isDataRequest: false,
			isSubRequest: false
		};

		const response = await meModule.GET(event as any);
		const data = await response.json();

		expect(data.user).toBeNull();
	});
});
