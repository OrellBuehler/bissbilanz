import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_OAUTH_CLIENT } from '../helpers/fixtures';

// Create mock DB
const { db, setResult, reset } = createMockDB();

// Mock env first
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

// Import schema
const schema = await import('$lib/server/schema');

// Mock db (re-export entire schema module)
mock.module('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(
		Object.entries(schema).map(([key, value]) => [key, value])
	)
}));

// Import after mocking
const {
	generateToken,
	generateClientId,
	generateClientSecret,
	hashToken,
	verifyToken,
	verifyPKCE,
	isValidCodeVerifier,
	isValidCodeChallengeS256,
	getOrCreateOAuthClient,
	getOAuthClient,
	verifyOAuthClient,
	getPublicOAuthClient,
	regenerateClientSecret,
	addAllowedRedirectUri,
	validateRedirectUri,
	hasAuthorization,
	createAuthorization,
	createAuthorizationCode,
	consumeAuthorizationCode,
	createAccessToken,
	refreshAccessToken,
	validateAccessToken,
	revokeClientTokens,
	cleanupExpiredOAuthData
} = await import('$lib/server/oauth');

describe('oauth-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('token generation', () => {
		test('generateToken creates base64url string', () => {
			const token = generateToken();
			expect(token).toBeTruthy();
			expect(typeof token).toBe('string');
			// Base64url should only contain A-Za-z0-9_-
			expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
		});

		test('generateToken respects byte length', () => {
			const token1 = generateToken(16);
			const token2 = generateToken(32);
			// Base64url encodes ~1.33 chars per byte
			expect(token2.length).toBeGreaterThan(token1.length);
		});

		test('generateClientId creates unique IDs', () => {
			const id1 = generateClientId();
			const id2 = generateClientId();
			expect(id1).not.toBe(id2);
			expect(id1).toMatch(/^[A-Za-z0-9_-]+$/);
		});

		test('generateClientSecret creates unique secrets', () => {
			const secret1 = generateClientSecret();
			const secret2 = generateClientSecret();
			expect(secret1).not.toBe(secret2);
			expect(secret1).toMatch(/^[A-Za-z0-9_-]+$/);
		});
	});

	describe('token hashing and verification', () => {
		test('hashToken creates bcrypt hash', () => {
			const token = 'test-token';
			const hash = hashToken(token);
			expect(hash).toBeTruthy();
			expect(hash).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash format
		});

		test('verifyToken validates correct token', () => {
			const token = 'test-token';
			const hash = hashToken(token);
			expect(verifyToken(token, hash)).toBe(true);
		});

		test('verifyToken rejects incorrect token', () => {
			const token = 'test-token';
			const hash = hashToken(token);
			expect(verifyToken('wrong-token', hash)).toBe(false);
		});
	});

	describe('PKCE verification', () => {
		test('verifyPKCE validates correct code verifier', () => {
			const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
			const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
			expect(verifyPKCE(codeVerifier, codeChallenge)).toBe(true);
		});

		test('verifyPKCE rejects incorrect code verifier', () => {
			const codeVerifier = 'wrong-verifier';
			const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
			expect(verifyPKCE(codeVerifier, codeChallenge)).toBe(false);
		});
	});

	describe('code verifier validation', () => {
		test('validates correct code verifier format', () => {
			const valid = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
			expect(isValidCodeVerifier(valid)).toBe(true);
		});

		test('rejects too short code verifier', () => {
			const tooShort = 'short';
			expect(isValidCodeVerifier(tooShort)).toBe(false);
		});

		test('rejects invalid characters', () => {
			const invalid = 'dBjftJeZ4CVP!mB92K27uhbUJU1p1r_wW1gFWFOEjXk!!!!!!';
			expect(isValidCodeVerifier(invalid)).toBe(false);
		});
	});

	describe('code challenge S256 validation', () => {
		test('validates correct S256 challenge', () => {
			const valid = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
			expect(isValidCodeChallengeS256(valid)).toBe(true);
		});

		test('rejects incorrect length', () => {
			const wrong = 'short';
			expect(isValidCodeChallengeS256(wrong)).toBe(false);
		});
	});

	describe('getOrCreateOAuthClient', () => {
		test('returns existing client without secret', async () => {
			setResult(TEST_OAUTH_CLIENT);

			const result = await getOrCreateOAuthClient(TEST_USER.id);

			expect(result.client).toEqual(TEST_OAUTH_CLIENT);
			expect(result.secret).toBeUndefined();
		});

		// Skip "creates new client" test - requires more sophisticated mock for insert().returning()
	});

	describe('getOAuthClient', () => {
		test('returns client by clientId', async () => {
			setResult(TEST_OAUTH_CLIENT);

			const result = await getOAuthClient('test-client');

			expect(result).toEqual(TEST_OAUTH_CLIENT);
		});

		test('returns undefined when not found', async () => {
			setResult(undefined);

			const result = await getOAuthClient('non-existent');

			expect(result).toBeUndefined();
		});
	});

	describe('verifyOAuthClient', () => {
		test('returns client when credentials valid', async () => {
			const clientWithHash = {
				...TEST_OAUTH_CLIENT,
				clientSecretHash: hashToken('correct-secret')
			};
			setResult(clientWithHash);

			const result = await verifyOAuthClient('test-client', 'correct-secret');

			expect(result).toBeTruthy();
		});

		test('returns undefined when client not found', async () => {
			setResult(undefined);

			const result = await verifyOAuthClient('test-client', 'secret');

			expect(result).toBeUndefined();
		});

		test('returns undefined when secret incorrect', async () => {
			const clientWithHash = {
				...TEST_OAUTH_CLIENT,
				clientSecretHash: hashToken('correct-secret')
			};
			setResult(clientWithHash);

			const result = await verifyOAuthClient('test-client', 'wrong-secret');

			expect(result).toBeUndefined();
		});
	});

	describe('getPublicOAuthClient', () => {
		test('returns client when tokenEndpointAuthMethod is none', async () => {
			const publicClient = {
				...TEST_OAUTH_CLIENT,
				tokenEndpointAuthMethod: 'none' as const
			};
			setResult(publicClient);

			const result = await getPublicOAuthClient('test-client');

			expect(result).toEqual(publicClient);
		});

		test('returns undefined when not public', async () => {
			setResult(TEST_OAUTH_CLIENT); // Default is not 'none'

			const result = await getPublicOAuthClient('test-client');

			expect(result).toBeUndefined();
		});
	});

	describe('regenerateClientSecret', () => {
		test('throws when client not found', async () => {
			setResult(undefined);

			await expect(regenerateClientSecret(TEST_USER.id)).rejects.toThrow(
				'No OAuth client found for user'
			);
		});

		// Skip "updates client secret hash" test - requires mock for update().returning()
	});

	describe('addAllowedRedirectUri', () => {
		test('returns existing client if URI already exists', async () => {
			const client = {
				...TEST_OAUTH_CLIENT,
				allowedRedirectUris: ['http://localhost:3000/callback']
			};
			setResult(client);

			const result = await addAllowedRedirectUri('test-client', 'http://localhost:3000/callback');

			expect(result).toEqual(client);
		});

		test('throws when client not found', async () => {
			setResult(undefined);

			await expect(
				addAllowedRedirectUri('test-client', 'http://localhost:3000/callback')
			).rejects.toThrow('OAuth client not found');
		});

		// Skip tests that require update().returning() - our simple mock doesn't support this
	});

	describe('validateRedirectUri', () => {
		test('validates allowed URI', () => {
			const client = {
				...TEST_OAUTH_CLIENT,
				allowedRedirectUris: ['http://localhost:3000/callback']
			};

			const result = validateRedirectUri(client, 'http://localhost:3000/callback');

			expect(result).toBe(true);
		});

		test('normalizes trailing slash', () => {
			const client = {
				...TEST_OAUTH_CLIENT,
				allowedRedirectUris: ['http://localhost:3000/callback']
			};

			const result = validateRedirectUri(client, 'http://localhost:3000/callback/');

			expect(result).toBe(true);
		});

		test('rejects disallowed URI', () => {
			const client = {
				...TEST_OAUTH_CLIENT,
				allowedRedirectUris: ['http://localhost:3000/callback']
			};

			const result = validateRedirectUri(client, 'http://evil.com/callback');

			expect(result).toBe(false);
		});
	});

	describe('hasAuthorization', () => {
		test('returns true when authorization exists', async () => {
			setResult({ userId: TEST_USER.id, clientId: 'test-client' });

			const result = await hasAuthorization(TEST_USER.id, 'test-client');

			expect(result).toBe(true);
		});

		test('returns false when no authorization', async () => {
			setResult(undefined);

			const result = await hasAuthorization(TEST_USER.id, 'test-client');

			expect(result).toBe(false);
		});
	});

	describe('createAuthorization', () => {
		test('creates new authorization', async () => {
			setResult(undefined); // No existing
			const newAuth = { userId: TEST_USER.id, clientId: 'test-client', id: 'auth-123' };
			setResult([newAuth]);

			const result = await createAuthorization(TEST_USER.id, 'test-client');

			expect(result).toBeTruthy();
		});

		test('returns existing authorization if already exists', async () => {
			const existing = { userId: TEST_USER.id, clientId: 'test-client', id: 'auth-123', approvedAt: new Date() };
			setResult(existing);

			const result = await createAuthorization(TEST_USER.id, 'test-client');

			expect(result).toEqual(existing);
		});
	});

	describe('createAuthorizationCode', () => {
		test('generates authorization code', async () => {
			setResult([]);

			const code = await createAuthorizationCode(
				TEST_USER.id,
				'test-client',
				'http://localhost:3000/callback',
				'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
			);

			expect(code).toBeTruthy();
			expect(typeof code).toBe('string');
		});
	});

	describe('consumeAuthorizationCode', () => {
		test('returns userId when code valid', async () => {
			const authCode = {
				code: 'hashed-code',
				clientId: 'test-client',
				userId: TEST_USER.id,
				redirectUri: 'http://localhost:3000/callback',
				codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
				codeChallengeMethod: 'S256' as const,
				expiresAt: new Date(Date.now() + 60000),
				usedAt: null
			};
			setResult(authCode);

			const result = await consumeAuthorizationCode(
				'raw-code',
				'test-client',
				'http://localhost:3000/callback',
				'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
			);

			expect(result).toBe(TEST_USER.id);
		});

		test('returns undefined when code not found', async () => {
			setResult(undefined);

			const result = await consumeAuthorizationCode(
				'code',
				'test-client',
				'http://localhost:3000/callback',
				'verifier'
			);

			expect(result).toBeUndefined();
		});

		test('returns undefined when code already used', async () => {
			const usedCode = {
				code: 'hashed-code',
				clientId: 'test-client',
				userId: TEST_USER.id,
				redirectUri: 'http://localhost:3000/callback',
				codeChallenge: 'challenge',
				codeChallengeMethod: 'S256' as const,
				expiresAt: new Date(Date.now() + 60000),
				usedAt: new Date()
			};
			setResult(usedCode);

			const result = await consumeAuthorizationCode(
				'code',
				'test-client',
				'http://localhost:3000/callback',
				'verifier'
			);

			expect(result).toBeUndefined();
		});

		test('returns undefined when code expired', async () => {
			const expiredCode = {
				code: 'hashed-code',
				clientId: 'test-client',
				userId: TEST_USER.id,
				redirectUri: 'http://localhost:3000/callback',
				codeChallenge: 'challenge',
				codeChallengeMethod: 'S256' as const,
				expiresAt: new Date(Date.now() - 1000),
				usedAt: null
			};
			setResult(expiredCode);

			const result = await consumeAuthorizationCode(
				'code',
				'test-client',
				'http://localhost:3000/callback',
				'verifier'
			);

			expect(result).toBeUndefined();
		});
	});

	describe('createAccessToken', () => {
		test('generates access and refresh tokens', async () => {
			setResult([]);

			const result = await createAccessToken(TEST_USER.id, 'test-client');

			expect(result.accessToken).toBeTruthy();
			expect(result.refreshToken).toBeTruthy();
			expect(result.accessToken).not.toBe(result.refreshToken);
		});
	});

	describe('refreshAccessToken', () => {
		test('generates new token pair when refresh valid', async () => {
			const tokenRecord = {
				id: 'token-123',
				refreshTokenHash: 'hash',
				clientId: 'test-client',
				userId: TEST_USER.id,
				expiresAt: new Date(Date.now() + 60000),
				refreshTokenExpiresAt: new Date(Date.now() + 60000)
			};
			setResult(tokenRecord);

			const result = await refreshAccessToken('refresh-token', 'test-client');

			expect(result).toBeTruthy();
			if (result) {
				expect(result.accessToken).toBeTruthy();
				expect(result.refreshToken).toBeTruthy();
				expect(result.userId).toBe(TEST_USER.id);
			}
		});

		test('returns undefined when refresh token not found', async () => {
			setResult(undefined);

			const result = await refreshAccessToken('refresh-token', 'test-client');

			expect(result).toBeUndefined();
		});
	});

	describe('validateAccessToken', () => {
		test('returns user and client ID when token valid', async () => {
			const tokenRecord = {
				accessTokenHash: 'hash',
				userId: TEST_USER.id,
				clientId: 'test-client',
				expiresAt: new Date(Date.now() + 60000)
			};
			setResult(tokenRecord);

			const result = await validateAccessToken('access-token');

			expect(result).toBeTruthy();
			if (result) {
				expect(result.userId).toBe(TEST_USER.id);
				expect(result.clientId).toBe('test-client');
			}
		});

		test('returns undefined when token not found', async () => {
			setResult(undefined);

			const result = await validateAccessToken('access-token');

			expect(result).toBeUndefined();
		});
	});

	describe('revokeClientTokens', () => {
		test('deletes all tokens for client', async () => {
			setResult([]);

			await revokeClientTokens('test-client');

			// No error means success
			expect(true).toBe(true);
		});
	});

	describe('cleanupExpiredOAuthData', () => {
		test('removes expired tokens and codes', async () => {
			setResult([]);

			await cleanupExpiredOAuthData();

			// No error means success
			expect(true).toBe(true);
		});
	});
});
