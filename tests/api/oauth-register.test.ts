import { describe, test, expect, vi } from 'vitest';
import { allOAuthExports } from '../helpers/mock-oauth';

// Mock DB
const mockInsert = { values: async () => ({}) };
vi.mock('$lib/server/db', () => ({
	getDB: () => ({
		insert: () => mockInsert
	}),
	oauthClients: {}
}));

vi.mock('$lib/server/oauth', () => ({
	...allOAuthExports,
	generateClientId: () => 'generated-client-id',
	generateClientSecret: () => 'generated-client-secret',
	hashToken: (t: string) => `hashed-${t}`
}));

const { POST } = await import('../../src/routes/api/oauth/register/+server');

function createRegisterRequest(body: unknown) {
	const request = new Request('http://localhost:5173/api/oauth/register', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	return {
		request,
		url: new URL('http://localhost:5173/api/oauth/register'),
		params: {},
		locals: {},
		cookies: { get: () => undefined, set: () => {}, delete: () => {}, serialize: () => '' },
		fetch: globalThis.fetch,
		getClientAddress: () => '127.0.0.1',
		platform: undefined,
		route: { id: '/api/oauth/register' },
		setHeaders: () => {},
		isDataRequest: false,
		isSubRequest: false
	} as any;
}

describe('POST /api/oauth/register', () => {
	test('registers client with valid redirect URIs', async () => {
		const event = createRegisterRequest({
			redirect_uris: ['https://example.com/callback'],
			client_name: 'Test App'
		});
		const response = await POST(event);
		const data = await response.json();
		expect(response.status).toBe(201);
		expect(data.client_id).toBe('generated-client-id');
		expect(data.client_secret).toBe('generated-client-secret');
		expect(data.client_name).toBe('Test App');
		expect(data.redirect_uris).toEqual(['https://example.com/callback']);
		expect(data.grant_types).toEqual(['authorization_code']);
		expect(data.response_types).toEqual(['code']);
	});

	test('registers public client (auth method = none)', async () => {
		const event = createRegisterRequest({
			redirect_uris: ['https://example.com/callback'],
			token_endpoint_auth_method: 'none'
		});
		const response = await POST(event);
		const data = await response.json();
		expect(response.status).toBe(201);
		expect(data.client_id).toBe('generated-client-id');
		expect(data.client_secret).toBeUndefined();
	});

	test('accepts localhost redirect URI', async () => {
		const event = createRegisterRequest({
			redirect_uris: ['http://localhost:3000/callback']
		});
		const response = await POST(event);
		expect(response.status).toBe(201);
	});

	test('accepts 127.0.0.1 redirect URI', async () => {
		const event = createRegisterRequest({
			redirect_uris: ['http://127.0.0.1:8080/callback']
		});
		const response = await POST(event);
		expect(response.status).toBe(201);
	});

	test('rejects missing redirect_uris', async () => {
		const event = createRegisterRequest({
			client_name: 'No URIs'
		});
		const response = await POST(event);
		const data = await response.json();
		expect(response.status).toBe(400);
		expect(data.error).toBe('invalid_redirect_uri');
	});

	test('rejects empty redirect_uris array', async () => {
		const event = createRegisterRequest({
			redirect_uris: []
		});
		const response = await POST(event);
		const data = await response.json();
		expect(response.status).toBe(400);
		expect(data.error).toBe('invalid_redirect_uri');
	});

	test('rejects HTTP redirect URI on non-localhost', async () => {
		const event = createRegisterRequest({
			redirect_uris: ['http://example.com/callback']
		});
		const response = await POST(event);
		const data = await response.json();
		expect(response.status).toBe(400);
		expect(data.error).toBe('invalid_redirect_uri');
	});

	test('rejects invalid URI format', async () => {
		const event = createRegisterRequest({
			redirect_uris: ['not-a-url']
		});
		const response = await POST(event);
		expect(response.status).toBe(400);
	});

	test('rejects invalid grant_types', async () => {
		const event = createRegisterRequest({
			redirect_uris: ['https://example.com/callback'],
			grant_types: ['client_credentials']
		});
		const response = await POST(event);
		const data = await response.json();
		expect(response.status).toBe(400);
		expect(data.error).toBe('invalid_client_metadata');
		expect(data.error_description).toContain('authorization_code');
	});

	test('rejects invalid response_types', async () => {
		const event = createRegisterRequest({
			redirect_uris: ['https://example.com/callback'],
			response_types: ['token']
		});
		const response = await POST(event);
		const data = await response.json();
		expect(response.status).toBe(400);
		expect(data.error).toBe('invalid_client_metadata');
		expect(data.error_description).toContain('code');
	});

	test('rejects unsupported auth method', async () => {
		const event = createRegisterRequest({
			redirect_uris: ['https://example.com/callback'],
			token_endpoint_auth_method: 'client_secret_basic'
		});
		const response = await POST(event);
		const data = await response.json();
		expect(response.status).toBe(400);
		expect(data.error).toBe('invalid_client_metadata');
	});

	test('rejects invalid JSON body', async () => {
		const request = new Request('http://localhost:5173/api/oauth/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not-json'
		});
		const event = {
			request,
			url: new URL('http://localhost:5173/api/oauth/register'),
			params: {},
			locals: {},
			cookies: { get: () => undefined, set: () => {}, delete: () => {}, serialize: () => '' },
			fetch: globalThis.fetch,
			getClientAddress: () => '127.0.0.1',
			platform: undefined,
			route: { id: '/api/oauth/register' },
			setHeaders: () => {},
			isDataRequest: false,
			isSubRequest: false
		} as any;
		const response = await POST(event);
		const data = await response.json();
		expect(response.status).toBe(400);
		expect(data.error).toBe('invalid_client_metadata');
	});

	test('strips trailing slash from redirect URIs', async () => {
		const event = createRegisterRequest({
			redirect_uris: ['https://example.com/callback/']
		});
		const response = await POST(event);
		const data = await response.json();
		expect(response.status).toBe(201);
		expect(data.redirect_uris).toEqual(['https://example.com/callback']);
	});
});
