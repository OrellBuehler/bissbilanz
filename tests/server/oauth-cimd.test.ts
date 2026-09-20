import { describe, test, expect, beforeEach, vi } from 'vitest';

const upserted: unknown[] = [];
vi.mock('$lib/server/db', () => ({
	getDB: () => ({
		insert: () => ({
			values: (row: unknown) => ({
				onConflictDoUpdate: () => ({
					returning: async () => {
						upserted.push(row);
						return [{ id: 'row', ...(row as object) }];
					}
				})
			})
		})
	}),
	oauthClients: { clientId: 'client_id' }
}));

vi.mock('@sentry/sveltekit', () => ({ captureException: vi.fn() }));

let resolvedAddresses: { address: string; family: number }[] = [
	{ address: '160.79.104.10', family: 4 }
];
vi.mock('node:dns/promises', () => ({
	lookup: async () => resolvedAddresses
}));

const {
	isClientIdMetadataUrl,
	isPublicIp,
	parseClientIdMetadata,
	resolveClientIdMetadata,
	resolveOAuthClient,
	clearClientIdMetadataCache
} = await import('$lib/server/oauth-cimd');
const { validateRedirectUri, isLoopbackRedirectUri } = await import('$lib/server/oauth');

const CLIENT_ID = 'https://claude.ai/oauth/claude-code-client-metadata';
const DOC = {
	client_id: CLIENT_ID,
	client_name: 'Claude Code',
	client_uri: 'https://claude.ai',
	redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
	token_endpoint_auth_method: 'none',
	grant_types: ['authorization_code', 'refresh_token'],
	response_types: ['code']
};

function mockFetch(
	body: unknown,
	init: { status?: number; headers?: Record<string, string> } = {}
) {
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	return vi.fn(
		async () => new Response(text, { status: init.status ?? 200, headers: init.headers })
	);
}

describe('isClientIdMetadataUrl', () => {
	test.each([CLIENT_ID, 'https://example.com/client.json', 'https://example.com/a/b/c?v=1'])(
		'accepts %s',
		(id) => {
			expect(isClientIdMetadataUrl(id)).toBe(true);
		}
	);

	test.each([
		'abc123',
		'http://example.com/client.json',
		'https://example.com',
		'https://example.com/',
		'https://example.com/client.json#frag',
		'https://user:pw@example.com/client.json',
		'https://example.com/../client.json',
		'https://localhost/client.json',
		'https://127.0.0.1/client.json',
		'https://[::1]/client.json',
		'https://intranet/client.json',
		'https://printer.local/client.json',
		'https://Example.com/client.json'
	])('rejects %s', (id) => {
		expect(isClientIdMetadataUrl(id)).toBe(false);
	});
});

describe('parseClientIdMetadata', () => {
	test('accepts a well-formed document', () => {
		expect(parseClientIdMetadata(CLIENT_ID, DOC)).toEqual({
			clientId: CLIENT_ID,
			clientName: 'Claude Code',
			clientUri: 'https://claude.ai',
			redirectUris: ['http://localhost/callback', 'http://127.0.0.1/callback']
		});
	});

	test('accepts a minimal document', () => {
		expect(
			parseClientIdMetadata(CLIENT_ID, {
				client_id: CLIENT_ID,
				redirect_uris: ['https://claude.ai/api/mcp/auth_callback/']
			})
		).toEqual({
			clientId: CLIENT_ID,
			clientName: null,
			clientUri: null,
			redirectUris: ['https://claude.ai/api/mcp/auth_callback']
		});
	});

	test('rejects a document whose client_id differs from its URL', () => {
		expect(parseClientIdMetadata(CLIENT_ID, { ...DOC, client_id: 'https://evil.example/x' })).toBe(
			undefined
		);
	});

	test.each([
		['no redirect_uris', { ...DOC, redirect_uris: undefined }],
		['empty redirect_uris', { ...DOC, redirect_uris: [] }],
		['javascript redirect', { ...DOC, redirect_uris: ['javascript:alert(1)'] }],
		['http non-loopback redirect', { ...DOC, redirect_uris: ['http://example.com/cb'] }],
		['confidential auth method', { ...DOC, token_endpoint_auth_method: 'client_secret_post' }],
		['no authorization_code grant', { ...DOC, grant_types: ['implicit'] }],
		['no code response type', { ...DOC, response_types: ['token'] }],
		['array body', [DOC]],
		['null body', null]
	])('rejects %s', (_label, body) => {
		expect(parseClientIdMetadata(CLIENT_ID, body)).toBe(undefined);
	});

	test('truncates an oversized client_name', () => {
		const parsed = parseClientIdMetadata(CLIENT_ID, { ...DOC, client_name: 'x'.repeat(1000) });
		expect(parsed?.clientName).toHaveLength(256);
	});
});

describe('isPublicIp', () => {
	test.each(['160.79.104.10', '8.8.8.8', '2606:4700::1111'])('accepts %s', (ip) => {
		expect(isPublicIp(ip)).toBe(true);
	});

	test.each([
		'127.0.0.1',
		'10.1.2.3',
		'172.16.0.1',
		'172.31.255.255',
		'192.168.1.1',
		'169.254.169.254',
		'100.64.0.1',
		'0.0.0.0',
		'224.0.0.1',
		'::1',
		'::',
		'fd00::1',
		'fe80::1',
		'::ffff:10.0.0.1'
	])('rejects %s', (ip) => {
		expect(isPublicIp(ip)).toBe(false);
	});
});

describe('resolveClientIdMetadata', () => {
	beforeEach(() => {
		clearClientIdMetadataCache();
		upserted.length = 0;
		resolvedAddresses = [{ address: '160.79.104.10', family: 4 }];
	});

	test('refuses hosts that resolve to a private address', async () => {
		resolvedAddresses = [
			{ address: '160.79.104.10', family: 4 },
			{ address: '10.0.0.5', family: 4 }
		];
		const fetch = mockFetch(DOC);
		vi.stubGlobal('fetch', fetch);
		expect(await resolveClientIdMetadata(CLIENT_ID)).toBe(undefined);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('refuses hosts that do not resolve', async () => {
		resolvedAddresses = [];
		const fetch = mockFetch(DOC);
		vi.stubGlobal('fetch', fetch);
		expect(await resolveClientIdMetadata(CLIENT_ID)).toBe(undefined);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('fetches, validates and caches the document', async () => {
		const fetch = mockFetch(DOC);
		vi.stubGlobal('fetch', fetch);

		const first = await resolveClientIdMetadata(CLIENT_ID);
		const second = await resolveClientIdMetadata(CLIENT_ID);

		expect(first?.clientName).toBe('Claude Code');
		expect(second).toBe(first);
		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(CLIENT_ID);
		expect(init.redirect).toBe('manual');
	});

	test('does not fetch non-CIMD client ids', async () => {
		const fetch = mockFetch(DOC);
		vi.stubGlobal('fetch', fetch);
		expect(await resolveClientIdMetadata('plain-client')).toBe(undefined);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('returns undefined on a non-2xx response', async () => {
		vi.stubGlobal('fetch', mockFetch('nope', { status: 404 }));
		expect(await resolveClientIdMetadata(CLIENT_ID)).toBe(undefined);
	});

	test('returns undefined on a redirect', async () => {
		vi.stubGlobal('fetch', mockFetch('', { status: 302, headers: { location: 'https://x/y' } }));
		expect(await resolveClientIdMetadata(CLIENT_ID)).toBe(undefined);
	});

	test('returns undefined on invalid JSON', async () => {
		vi.stubGlobal('fetch', mockFetch('{not json'));
		expect(await resolveClientIdMetadata(CLIENT_ID)).toBe(undefined);
	});

	test('returns undefined on an oversized body', async () => {
		vi.stubGlobal('fetch', mockFetch({ ...DOC, pad: 'x'.repeat(70 * 1024) }));
		expect(await resolveClientIdMetadata(CLIENT_ID)).toBe(undefined);
	});

	test('returns undefined when fetch throws', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('timeout');
			})
		);
		expect(await resolveClientIdMetadata(CLIENT_ID)).toBe(undefined);
	});

	test('does not cache failures', async () => {
		vi.stubGlobal('fetch', mockFetch('nope', { status: 500 }));
		expect(await resolveClientIdMetadata(CLIENT_ID)).toBe(undefined);
		vi.stubGlobal('fetch', mockFetch(DOC));
		expect((await resolveClientIdMetadata(CLIENT_ID))?.clientName).toBe('Claude Code');
	});
});

describe('resolveOAuthClient', () => {
	beforeEach(() => {
		clearClientIdMetadataCache();
		upserted.length = 0;
	});

	test('materialises a CIMD client as a public oauth_clients row', async () => {
		vi.stubGlobal('fetch', mockFetch(DOC));
		const client = await resolveOAuthClient(CLIENT_ID);
		expect(client?.clientId).toBe(CLIENT_ID);
		expect(client?.tokenEndpointAuthMethod).toBe('none');
		expect(client?.clientSecretHash).toBe(null);
		expect(client?.userId).toBe(null);
		expect(client?.allowedRedirectUris).toEqual(DOC.redirect_uris);
		expect(upserted).toHaveLength(1);
	});

	test('returns undefined when the document cannot be fetched', async () => {
		vi.stubGlobal('fetch', mockFetch('', { status: 503 }));
		expect(await resolveOAuthClient(CLIENT_ID)).toBe(undefined);
		expect(upserted).toHaveLength(0);
	});
});

describe('validateRedirectUri loopback matching', () => {
	const client = {
		allowedRedirectUris: [
			'http://localhost/callback',
			'http://127.0.0.1/callback',
			'https://claude.ai/api/mcp/auth_callback'
		]
	} as never;

	test.each([
		'http://localhost:3118/callback',
		'http://localhost/callback',
		'http://127.0.0.1:65000/callback',
		'https://claude.ai/api/mcp/auth_callback',
		'https://claude.ai/api/mcp/auth_callback/'
	])('accepts %s', (uri) => {
		expect(validateRedirectUri(client, uri)).toBe(true);
	});

	test.each([
		'http://localhost:3118/other',
		'http://localhost:3118/callback?x=1',
		'https://localhost:3118/callback',
		'http://evil.example/callback',
		'https://claude.ai:8443/api/mcp/auth_callback',
		'https://claude.ai/api/mcp/auth_callback2'
	])('rejects %s', (uri) => {
		expect(validateRedirectUri(client, uri)).toBe(false);
	});

	test('isLoopbackRedirectUri flags loopback only', () => {
		expect(isLoopbackRedirectUri('http://localhost:1234/cb')).toBe(true);
		expect(isLoopbackRedirectUri('http://127.0.0.1/cb')).toBe(true);
		expect(isLoopbackRedirectUri('https://claude.ai/cb')).toBe(false);
		expect(isLoopbackRedirectUri('http://example.com/cb')).toBe(false);
	});
});
