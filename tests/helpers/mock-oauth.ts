/**
 * Complete OAuth module stubs for vi.mock('$lib/server/oauth').
 *
 * Every test file that mocks the OAuth module MUST include all exports,
 * because vi.mock hoists to the top of the file and replaces the entire module.
 * If a mock is missing an export, other imports will fail with "Export named X not found".
 *
 * Usage in test files:
 *   import { allOAuthExports } from '../helpers/mock-oauth';
 *   vi.mock('$lib/server/oauth', () => ({
 *       ...allOAuthExports,
 *       // override specific functions as needed
 *   }));
 */

export const allOAuthExports = {
	// Constants
	SALT_ROUNDS: 10,
	ACCESS_TOKEN_LIFETIME_MS: 3600000,
	REFRESH_TOKEN_LIFETIME_MS: 2592000000,
	AUTH_CODE_LIFETIME_MS: 600000,
	// Sync utilities
	generateToken: () => 'mock-token',
	generateClientId: () => 'mock-client-id',
	generateClientSecret: () => 'mock-client-secret',
	hashToken: (t: string) => `hashed-${t}`,
	verifyToken: () => false,
	verifyPKCE: () => true,
	isValidCodeVerifier: () => true,
	isValidCodeChallengeS256: () => true,
	validateRedirectUri: () => false,
	// Async operations
	getOrCreateOAuthClient: async () => null,
	getOAuthClient: async () => null,
	verifyOAuthClient: async () => null,
	getPublicOAuthClient: async () => null,
	regenerateClientSecret: async () => null,
	addAllowedRedirectUri: async () => null,
	hasAuthorization: async () => false,
	createAuthorization: async () => null,
	createAuthorizationCode: async () => null,
	consumeAuthorizationCode: async () => null,
	createAccessToken: async () => null,
	refreshAccessToken: async () => null,
	validateAccessToken: async () => null,
	listAuthorizedClients: async () => [],
	revokeAuthorization: async () => {},
	revokeClientTokens: async () => {},
	cleanupExpiredOAuthData: async () => {}
};
