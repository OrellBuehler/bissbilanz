import { describe, test, expect, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

vi.mock('$lib/server/client-ip', () => ({ getRequestIp: () => '203.0.113.9' }));
vi.mock('$lib/server/oauth', () => ({}));
vi.mock('$lib/server/oauth-cimd', () => ({}));
vi.mock('$lib/server/session', () => ({}));

const limited = new Set<string>();
const keys: string[] = [];
vi.mock('$lib/server/rate-limit', () => ({
	rateLimit: (key: string) => {
		keys.push(key);
		if (limited.has(key)) throw new Error('Rate limit exceeded');
	}
}));

const { GET } = await import('../../src/routes/api/oauth/authorize/+server');

const call = async () => {
	const url = new URL('http://localhost/api/oauth/authorize');
	try {
		return await GET({ url, request: new Request(url) } as unknown as Parameters<typeof GET>[0]);
	} catch (err) {
		return err;
	}
};

describe('GET /api/oauth/authorize rate limit', () => {
	test('is limited per client address', async () => {
		limited.add('oauth:authorize:203.0.113.9');
		const err = await call();
		expect(isHttpError(err) && err.status).toBe(429);
		expect(keys).toContain('oauth:authorize:203.0.113.9');
	});

	test('lets requests through under the limit', async () => {
		limited.clear();
		const err = await call();
		expect(isHttpError(err) && err.status === 429).toBe(false);
	});
});
