import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { TEST_USER } from '../helpers/fixtures';
import { allOAuthExports } from '../helpers/mock-oauth';

let mockVerifyClientResult: any = null;
let mockPublicClientResult: any = null;
let mockConsumeCodeResult: string | null = null;
let mockCreateTokenResult: any = null;
let mockRefreshResult: any = null;

mock.module('$lib/server/oauth', () => ({
	...allOAuthExports,
	verifyOAuthClient: async () => mockVerifyClientResult,
	getPublicOAuthClient: async () => mockPublicClientResult,
	consumeAuthorizationCode: async () => mockConsumeCodeResult,
	createAccessToken: async () => mockCreateTokenResult,
	refreshAccessToken: async () => mockRefreshResult,
	isValidCodeVerifier: (v: string) => /^[A-Za-z0-9._~-]{43,128}$/.test(v)
}));

const { POST } = await import('../../src/routes/api/oauth/token/+server');

// Helper to create a form data request
function createTokenRequest(fields: Record<string, string>) {
	const formData = new URLSearchParams();
	Object.entries(fields).forEach(([key, value]) => {
		formData.set(key, value);
	});

	const request = new Request('http://localhost:5173/api/oauth/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: formData.toString()
	});

	return {
		request,
		url: new URL('http://localhost:5173/api/oauth/token'),
		params: {},
		locals: {},
		cookies: { get: () => undefined, set: () => {}, delete: () => {}, serialize: () => '' },
		fetch: globalThis.fetch,
		getClientAddress: () => '127.0.0.1',
		platform: undefined,
		route: { id: '/api/oauth/token' },
		setHeaders: () => {},
		isDataRequest: false,
		isSubRequest: false
	} as any;
}

// Valid code verifier (43+ chars, unreserved chars)
const VALID_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

describe('POST /api/oauth/token', () => {
	beforeEach(() => {
		mockVerifyClientResult = null;
		mockPublicClientResult = null;
		mockConsumeCodeResult = null;
		mockCreateTokenResult = null;
		mockRefreshResult = null;
	});

	describe('validation', () => {
		test('returns error when grant_type missing', async () => {
			const event = createTokenRequest({ client_id: 'test' });
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('invalid_request');
			expect(data.error_description).toContain('grant_type');
		});

		test('returns error for unsupported grant_type', async () => {
			const event = createTokenRequest({
				grant_type: 'client_credentials',
				client_id: 'test'
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('unsupported_grant_type');
		});
	});

	describe('authorization_code grant', () => {
		test('returns error when required params missing', async () => {
			const event = createTokenRequest({
				grant_type: 'authorization_code',
				client_id: 'test'
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('invalid_request');
		});

		test('returns error for invalid code_verifier format', async () => {
			const event = createTokenRequest({
				grant_type: 'authorization_code',
				code: 'auth-code-123',
				redirect_uri: 'http://localhost:3000/callback',
				client_id: 'test-client',
				code_verifier: 'short'
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('invalid_request');
			expect(data.error_description).toContain('code_verifier');
		});

		test('returns error for invalid client', async () => {
			mockVerifyClientResult = null;
			mockPublicClientResult = null;
			const event = createTokenRequest({
				grant_type: 'authorization_code',
				code: 'auth-code-123',
				redirect_uri: 'http://localhost:3000/callback',
				client_id: 'unknown-client',
				code_verifier: VALID_VERIFIER
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('invalid_client');
		});

		test('returns error for invalid authorization code', async () => {
			mockPublicClientResult = { clientId: 'test-client' };
			mockConsumeCodeResult = null;
			const event = createTokenRequest({
				grant_type: 'authorization_code',
				code: 'invalid-code',
				redirect_uri: 'http://localhost:3000/callback',
				client_id: 'test-client',
				code_verifier: VALID_VERIFIER
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('invalid_grant');
		});

		test('returns tokens on successful code exchange', async () => {
			mockPublicClientResult = { clientId: 'test-client' };
			mockConsumeCodeResult = TEST_USER.id;
			mockCreateTokenResult = {
				accessToken: 'new-access-token',
				refreshToken: 'new-refresh-token'
			};
			const event = createTokenRequest({
				grant_type: 'authorization_code',
				code: 'valid-code',
				redirect_uri: 'http://localhost:3000/callback',
				client_id: 'test-client',
				code_verifier: VALID_VERIFIER
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.access_token).toBe('new-access-token');
			expect(data.refresh_token).toBe('new-refresh-token');
			expect(data.token_type).toBe('Bearer');
			expect(data.expires_in).toBe(3600);
		});

		test('sets cache-control headers', async () => {
			mockPublicClientResult = { clientId: 'test-client' };
			mockConsumeCodeResult = TEST_USER.id;
			mockCreateTokenResult = {
				accessToken: 'token',
				refreshToken: 'refresh'
			};
			const event = createTokenRequest({
				grant_type: 'authorization_code',
				code: 'valid-code',
				redirect_uri: 'http://localhost:3000/callback',
				client_id: 'test-client',
				code_verifier: VALID_VERIFIER
			});
			const response = await POST(event);
			expect(response.headers.get('Cache-Control')).toBe('no-store');
			expect(response.headers.get('Pragma')).toBe('no-cache');
		});
	});

	describe('refresh_token grant', () => {
		test('returns error when refresh_token missing', async () => {
			const event = createTokenRequest({
				grant_type: 'refresh_token',
				client_id: 'test-client'
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('invalid_request');
		});

		test('returns error when client_id missing', async () => {
			const event = createTokenRequest({
				grant_type: 'refresh_token',
				refresh_token: 'some-token'
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('invalid_request');
		});

		test('returns error for invalid client', async () => {
			mockPublicClientResult = null;
			const event = createTokenRequest({
				grant_type: 'refresh_token',
				refresh_token: 'some-token',
				client_id: 'unknown-client'
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('invalid_client');
		});

		test('returns error for invalid refresh token', async () => {
			mockPublicClientResult = { clientId: 'test-client' };
			mockRefreshResult = null;
			const event = createTokenRequest({
				grant_type: 'refresh_token',
				refresh_token: 'expired-token',
				client_id: 'test-client'
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('invalid_grant');
		});

		test('returns new tokens on successful refresh', async () => {
			mockPublicClientResult = { clientId: 'test-client' };
			mockRefreshResult = {
				accessToken: 'refreshed-access-token',
				refreshToken: 'refreshed-refresh-token'
			};
			const event = createTokenRequest({
				grant_type: 'refresh_token',
				refresh_token: 'valid-refresh-token',
				client_id: 'test-client'
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.access_token).toBe('refreshed-access-token');
			expect(data.refresh_token).toBe('refreshed-refresh-token');
			expect(data.token_type).toBe('Bearer');
		});
	});
});
