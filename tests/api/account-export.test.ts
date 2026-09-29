import { describe, test, expect, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

let built = 0;
vi.mock('$lib/server/export', () => ({
	buildAccountExport: async () => {
		built += 1;
		return new Uint8Array([80, 75]);
	}
}));
vi.mock('$lib/server/rate-limit', () => ({ rateLimit: () => {} }));

const { GET } = await import('../../src/routes/api/account/export/+server');

const withScopes = (tokenScopes?: string[]) =>
	({ ...createMockEvent({ user: TEST_USER }), locals: { user: TEST_USER, tokenScopes } }) as any;

describe('GET /api/account/export', () => {
	test('returns 401 when not authenticated', async () => {
		const response = await GET(createMockEvent({ user: null }));
		expect(response.status).toBe(401);
	});

	test('exports for a cookie session', async () => {
		const response = await GET(withScopes(undefined));
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/zip');
	});

	test('exports for the first-party mobile token', async () => {
		const response = await GET(withScopes(['mcp:access', 'account:manage']));
		expect(response.status).toBe(200);
	});

	test('forbids an OAuth/MCP token from exporting the account', async () => {
		built = 0;
		const response = await GET(withScopes(['mcp:access']));
		expect(response.status).toBe(403);
		expect(built).toBe(0);
	});
});
