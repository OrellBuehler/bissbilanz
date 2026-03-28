import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockDB } from '../helpers/mock-db';

const { db, setResult, reset } = createMockDB();

vi.mock('$lib/server/env', () => ({
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
		session: { secret: 'test-secret' },
		infomaniak: {
			clientId: 'test-client-id',
			clientSecret: 'test-client-secret',
			redirectUri: 'http://localhost:5173/api/auth/callback'
		},
		app: { url: 'http://localhost:5173' }
	}
}));

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

let tokenCounter = 0;
vi.mock('$lib/server/oauth', () => ({
	generateToken: vi.fn(() => `token-${++tokenCounter}`)
}));

const {
	storePendingState,
	consumePendingState,
	createOneTimeCode,
	consumeOneTimeCode,
	ensureMobileClient,
	MOBILE_CLIENT_ID
} = await import('$lib/server/mobile-auth');

describe('mobile-auth', () => {
	beforeEach(() => {
		reset();
		tokenCounter = 0;
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('storePendingState / consumePendingState', () => {
		test('stores state and retrieves it', () => {
			storePendingState('state-1', 'verifier-1', 'nonce-1');
			const result = consumePendingState('state-1');
			expect(result).toEqual({ codeVerifier: 'verifier-1', nonce: 'nonce-1' });
		});

		test('returns undefined for unknown state', () => {
			const result = consumePendingState('unknown-state');
			expect(result).toBeUndefined();
		});

		test('removes state after consumption', () => {
			storePendingState('state-2', 'verifier-2', 'nonce-2');
			consumePendingState('state-2');
			const result = consumePendingState('state-2');
			expect(result).toBeUndefined();
		});

		test('returns undefined for expired state', () => {
			storePendingState('state-3', 'verifier-3', 'nonce-3');
			vi.advanceTimersByTime(10 * 60 * 1000 + 1);
			const result = consumePendingState('state-3');
			expect(result).toBeUndefined();
		});

		test('returns state that has not yet expired', () => {
			storePendingState('state-4', 'verifier-4', 'nonce-4');
			vi.advanceTimersByTime(10 * 60 * 1000 - 1);
			const result = consumePendingState('state-4');
			expect(result).toEqual({ codeVerifier: 'verifier-4', nonce: 'nonce-4' });
		});
	});

	describe('createOneTimeCode / consumeOneTimeCode', () => {
		test('creates code and returns it', () => {
			const code = createOneTimeCode('user-123');
			expect(typeof code).toBe('string');
			expect(code.length).toBeGreaterThan(0);
		});

		test('created code can be consumed to get userId', () => {
			const code = createOneTimeCode('user-456');
			const userId = consumeOneTimeCode(code);
			expect(userId).toBe('user-456');
		});

		test('returns undefined for unknown code', () => {
			const userId = consumeOneTimeCode('nonexistent-code');
			expect(userId).toBeUndefined();
		});

		test('removes code after consumption', () => {
			const code = createOneTimeCode('user-789');
			consumeOneTimeCode(code);
			const second = consumeOneTimeCode(code);
			expect(second).toBeUndefined();
		});

		test('returns undefined for expired code', () => {
			const code = createOneTimeCode('user-abc');
			vi.advanceTimersByTime(60 * 1000 + 1);
			const userId = consumeOneTimeCode(code);
			expect(userId).toBeUndefined();
		});

		test('returns code that has not yet expired', () => {
			const code = createOneTimeCode('user-def');
			vi.advanceTimersByTime(60 * 1000 - 1);
			const userId = consumeOneTimeCode(code);
			expect(userId).toBe('user-def');
		});
	});

	describe('double-consumption prevention', () => {
		test('consuming state twice returns undefined on second call', () => {
			storePendingState('state-dc', 'verifier-dc', 'nonce-dc');
			const first = consumePendingState('state-dc');
			const second = consumePendingState('state-dc');
			expect(first).toEqual({ codeVerifier: 'verifier-dc', nonce: 'nonce-dc' });
			expect(second).toBeUndefined();
		});

		test('consuming code twice returns undefined on second call', () => {
			const code = createOneTimeCode('user-dc');
			const first = consumeOneTimeCode(code);
			const second = consumeOneTimeCode(code);
			expect(first).toBe('user-dc');
			expect(second).toBeUndefined();
		});
	});

	describe('ensureMobileClient', () => {
		test('does nothing when client already exists', async () => {
			setResult({ clientId: MOBILE_CLIENT_ID });
			await ensureMobileClient();
		});

		test('inserts client when not found', async () => {
			setResult(undefined);
			await ensureMobileClient();
		});

		test('subsequent calls with existing client do not throw', async () => {
			setResult({ clientId: MOBILE_CLIENT_ID });
			await ensureMobileClient();
			setResult({ clientId: MOBILE_CLIENT_ID });
			await ensureMobileClient();
		});
	});
});
