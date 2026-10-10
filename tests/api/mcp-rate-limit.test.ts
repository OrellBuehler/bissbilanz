import { describe, test, expect, vi } from 'vitest';
import { RateLimitError } from '$lib/server/errors';

const sentry = vi.hoisted(() => ({
	captureException: vi.fn(),
	captureMessage: vi.fn(),
	addBreadcrumb: vi.fn(),
	logger: { error: vi.fn() }
}));
vi.mock('@sentry/sveltekit', () => sentry);

vi.mock('$lib/server/env', () => ({ config: { app: { url: 'http://localhost:5173' } } }));
vi.mock('$lib/server/oauth', () => ({
	validateAccessToken: async () => ({
		userId: 'user-1',
		clientId: 'client-1',
		scopes: ['mcp:access']
	})
}));
vi.mock('$lib/server/mcp/server', () => ({ createMcpServer: () => ({}) }));
vi.mock('$lib/server/mcp/sweep', () => ({
	enforceUserSessionCap: () => {},
	sweepExpiredSessions: () => {}
}));

let rateLimitError: Error | null = null;
vi.mock('$lib/server/rate-limit', () => ({
	rateLimitMcp: () => {
		if (rateLimitError) throw rateLimitError;
	}
}));

const { POST } = await import('../../src/routes/api/mcp/+server');

const call = () =>
	POST({
		request: new Request('http://localhost:5173/api/mcp', {
			method: 'POST',
			headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
			body: '{}'
		}),
		url: new URL('http://localhost:5173/api/mcp')
	} as unknown as Parameters<typeof POST>[0]);

describe('POST /api/mcp rate limit', () => {
	test('answers a JSON-RPC error with Retry-After and no Sentry issue', async () => {
		rateLimitError = new RateLimitError(44);
		sentry.captureException.mockClear();

		const response = await call();

		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('44');
		expect(await response.json()).toEqual({
			jsonrpc: '2.0',
			id: null,
			error: { code: -32000, message: 'Rate limit exceeded' }
		});
		expect(sentry.captureException).not.toHaveBeenCalled();
	});

	test('falls back to a minute when the limiter gave no reset time', async () => {
		rateLimitError = new Error('Rate limit exceeded');

		const response = await call();

		expect(response.headers.get('Retry-After')).toBe('60');
	});
});
