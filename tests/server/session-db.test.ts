import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_SESSION, TEST_SESSION_WITH_USER } from '../helpers/fixtures';

// Create mock DB
const { db, setResult, reset } = createMockDB();

// Mock token-crypto first (no dependencies)
mock.module('$lib/server/token-crypto', () => ({
	encryptToken: async (token: string, secret: string) => `encrypted-${token}`
}));

// Mock env next (no dependencies)
mock.module('$lib/server/env', () => {
	const parseDatabaseConfig = (env: Record<string, string | undefined>) => {
		const toNumber = (value: string | undefined, fallback: number) => {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : fallback;
		};
		return {
			url: env.DATABASE_URL!,
			poolMax: toNumber(env.DATABASE_POOL_MAX, 10),
			idleTimeoutSeconds: toNumber(env.DATABASE_IDLE_TIMEOUT_SECONDS, 30),
			connectTimeoutSeconds: toNumber(env.DATABASE_CONNECT_TIMEOUT_SECONDS, 10),
			statementTimeoutMs: toNumber(env.DATABASE_STATEMENT_TIMEOUT_MS, 30_000),
			maxLifetimeSeconds: toNumber(env.DATABASE_MAX_LIFETIME_SECONDS, 300),
			applicationName: env.DATABASE_APPLICATION_NAME ?? 'bissbilanz'
		};
	};

	return {
		parseDatabaseConfig,
		config: {
			database: {
				url: 'postgres://test:test@localhost:5432/test',
				poolMax: 10,
				idleTimeoutSeconds: 30,
				connectTimeoutSeconds: 10,
				statementTimeoutMs: 30_000,
				maxLifetimeSeconds: 300,
				applicationName: 'bissbilanz-test'
			},
			session: {
				secret: 'test-secret'
			},
			infomaniak: {
				clientId: 'test-client-id',
				clientSecret: 'test-client-secret',
				redirectUri: 'http://localhost:5173/api/auth/callback'
			},
			app: {
				url: 'http://localhost:5173'
			}
		}
	};
});

// Now import schema (depends on env)
const schema = await import('$lib/server/schema');

// Mock db last (re-export schema)
mock.module('$lib/server/db', () => ({
	getDB: () => db,
	...schema
}));

// Import after mocking
const {
	generateSessionId,
	createSession,
	getSession,
	getSessionWithUser,
	deleteSession,
	deleteUserSessions,
	cleanExpiredSessions,
	createSessionCookie,
	clearSessionCookie,
	parseSessionCookie
} = await import('$lib/server/session');

describe('session-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('generateSessionId', () => {
		test('generates a valid UUID', () => {
			const id1 = generateSessionId();
			const id2 = generateSessionId();

			// UUIDs should be 36 characters with hyphens
			expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
			expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
			// Should be unique
			expect(id1).not.toBe(id2);
		});
	});

	describe('createSession', () => {
		test('creates session without refresh token', async () => {
			const newSession = { ...TEST_SESSION, refreshToken: null };
			setResult([newSession]);

			const result = await createSession(TEST_USER.id);

			expect(result.userId).toBe(TEST_USER.id);
			expect(result.refreshToken).toBeNull();
		});

		test('creates session with refresh token', async () => {
			const newSession = { ...TEST_SESSION, refreshToken: 'encrypted-refresh-token' };
			setResult([newSession]);

			const result = await createSession(TEST_USER.id, 'refresh-token');

			expect(result.userId).toBe(TEST_USER.id);
			expect(result.refreshToken).toBe('encrypted-refresh-token');
		});

		test('sets expiry date 7 days in future', async () => {
			const newSession = {
				...TEST_SESSION,
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
			};
			setResult([newSession]);

			const result = await createSession(TEST_USER.id);

			// Check that expiry is roughly 7 days from now (within 1 minute tolerance)
			const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
			const actualExpiry = result.expiresAt.getTime();
			expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(60000); // 1 minute tolerance
		});
	});

	describe('getSession', () => {
		test('returns session when valid and not expired', async () => {
			const futureSession = {
				...TEST_SESSION,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day from now
			};
			setResult([futureSession]);

			const result = await getSession(TEST_SESSION.id);

			expect(result).toBeTruthy();
			expect(result?.id).toBe(TEST_SESSION.id);
		});

		test('returns null when session not found', async () => {
			setResult([]);

			const result = await getSession('non-existent-id');

			expect(result).toBeNull();
		});

		test('returns null when session is expired', async () => {
			const expiredSession = {
				...TEST_SESSION,
				expiresAt: new Date(Date.now() - 1000) // 1 second ago
			};
			setResult([expiredSession]);

			const result = await getSession(TEST_SESSION.id);

			expect(result).toBeNull();
		});

		test('returns session when expiry is in the future', async () => {
			const validSession = {
				...TEST_SESSION,
				expiresAt: new Date(Date.now() + 1000) // 1 second from now
			};
			setResult([validSession]);

			const result = await getSession(TEST_SESSION.id);

			expect(result).toBeTruthy();
		});
	});

	describe('getSessionWithUser', () => {
		test('returns session with joined user data', async () => {
			const result = {
				session: {
					...TEST_SESSION,
					expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
				},
				user: TEST_USER
			};
			setResult([result]);

			const data = await getSessionWithUser(TEST_SESSION.id);

			expect(data).toBeTruthy();
			expect(data?.session.id).toBe(TEST_SESSION.id);
			expect(data?.user.id).toBe(TEST_USER.id);
		});

		test('returns null when session not found', async () => {
			setResult([]);

			const result = await getSessionWithUser('non-existent-id');

			expect(result).toBeNull();
		});

		test('returns null when session is expired', async () => {
			const expiredResult = {
				session: {
					...TEST_SESSION,
					expiresAt: new Date(Date.now() - 1000) // expired
				},
				user: TEST_USER
			};
			setResult([expiredResult]);

			const result = await getSessionWithUser(TEST_SESSION.id);

			expect(result).toBeNull();
		});
	});

	describe('deleteSession', () => {
		test('deletes session successfully', async () => {
			setResult([]);

			await deleteSession(TEST_SESSION.id);

			// No error means success (void function)
			expect(true).toBe(true);
		});

		test('does not throw when session not found', async () => {
			setResult([]);

			await deleteSession('non-existent-id');

			expect(true).toBe(true);
		});
	});

	describe('deleteUserSessions', () => {
		test('deletes all sessions for user', async () => {
			setResult([]);

			await deleteUserSessions(TEST_USER.id);

			// No error means success
			expect(true).toBe(true);
		});

		test('does not throw when user has no sessions', async () => {
			setResult([]);

			await deleteUserSessions('user-with-no-sessions');

			expect(true).toBe(true);
		});
	});

	describe('cleanExpiredSessions', () => {
		test('deletes expired sessions and returns count', async () => {
			const expiredIds = [
				{ id: '10000000-0000-4000-8000-000000000051' },
				{ id: '10000000-0000-4000-8000-000000000052' }
			];
			setResult(expiredIds);

			const count = await cleanExpiredSessions();

			expect(count).toBe(2);
		});

		test('returns 0 when no expired sessions', async () => {
			setResult([]);

			const count = await cleanExpiredSessions();

			expect(count).toBe(0);
		});

		test('respects batch size limit', async () => {
			const expiredIds = Array.from({ length: 10 }, (_, i) => ({
				id: `10000000-0000-4000-8000-00000000005${i}`
			}));
			setResult(expiredIds);

			const count = await cleanExpiredSessions(10);

			expect(count).toBe(10);
		});

		test('uses default batch size of 500', async () => {
			const expiredIds = Array.from({ length: 100 }, (_, i) => ({
				id: `10000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`
			}));
			setResult(expiredIds);

			const count = await cleanExpiredSessions();

			expect(count).toBe(100);
		});
	});

	describe('createSessionCookie', () => {
		test('creates cookie with default options', () => {
			const cookie = createSessionCookie(TEST_SESSION.id);

			expect(cookie).toContain(`session=${TEST_SESSION.id}`);
			expect(cookie).toContain('Path=/');
			expect(cookie).toContain('HttpOnly');
			expect(cookie).toContain('SameSite=Lax');
			expect(cookie).toContain('Max-Age=604800'); // 7 days in seconds
			expect(cookie).not.toContain('Secure'); // Not secure for http
		});

		test('creates secure cookie when secure option is true', () => {
			const cookie = createSessionCookie(TEST_SESSION.id, { secure: true });

			expect(cookie).toContain('Secure');
		});

		test('uses Strict SameSite when specified', () => {
			const cookie = createSessionCookie(TEST_SESSION.id, { sameSite: 'strict' });

			expect(cookie).toContain('SameSite=Strict');
		});

		test('uses None SameSite when specified', () => {
			const cookie = createSessionCookie(TEST_SESSION.id, { sameSite: 'none' });

			expect(cookie).toContain('SameSite=None');
		});

		test('defaults to Lax SameSite for invalid values', () => {
			const cookie = createSessionCookie(TEST_SESSION.id, { sameSite: 'invalid' as any });

			expect(cookie).toContain('SameSite=Lax');
		});
	});

	describe('clearSessionCookie', () => {
		test('creates clear cookie with default options', () => {
			const cookie = clearSessionCookie();

			expect(cookie).toContain('session=');
			expect(cookie).toContain('Path=/');
			expect(cookie).toContain('HttpOnly');
			expect(cookie).toContain('SameSite=Lax');
			expect(cookie).toContain('Max-Age=0');
			expect(cookie).not.toContain('Secure'); // Not secure for http
		});

		test('creates secure clear cookie when secure option is true', () => {
			const cookie = clearSessionCookie({ secure: true });

			expect(cookie).toContain('Secure');
		});

		test('uses specified SameSite value', () => {
			const cookie = clearSessionCookie({ sameSite: 'strict' });

			expect(cookie).toContain('SameSite=Strict');
		});
	});

	describe('parseSessionCookie', () => {
		test('extracts session ID from cookie header', () => {
			const cookieHeader = 'session=abc123; Path=/; HttpOnly';
			const sessionId = parseSessionCookie(cookieHeader);

			expect(sessionId).toBe('abc123');
		});

		test('returns null when cookie header is null', () => {
			const sessionId = parseSessionCookie(null);

			expect(sessionId).toBeNull();
		});

		test('returns null when session cookie not present', () => {
			const cookieHeader = 'other-cookie=value; Path=/';
			const sessionId = parseSessionCookie(cookieHeader);

			expect(sessionId).toBeNull();
		});

		test('extracts session from multiple cookies', () => {
			const cookieHeader = 'other=value; session=xyz789; another=data';
			const sessionId = parseSessionCookie(cookieHeader);

			expect(sessionId).toBe('xyz789');
		});

		test('handles UUID session IDs', () => {
			const cookieHeader = `session=${TEST_SESSION.id}; Path=/`;
			const sessionId = parseSessionCookie(cookieHeader);

			expect(sessionId).toBe(TEST_SESSION.id);
		});
	});
});
