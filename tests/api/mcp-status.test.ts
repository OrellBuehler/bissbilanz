import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';

let mockClients: unknown[] = [];

vi.mock('$lib/server/oauth', () => ({
	listAuthorizedClients: async () => mockClients
}));

const { GET } = await import('../../src/routes/api/mcp/status/+server');

describe('GET /api/mcp/status', () => {
	beforeEach(() => {
		mockClients = [];
	});

	test('returns 401 when not authenticated', async () => {
		const response = await GET(createMockEvent({ user: null }));
		await expectResponseContract('GET', '/api/mcp/status', response);
		expect(response.status).toBe(401);
	});

	test('reports disconnected when no client is authorized', async () => {
		const response = await GET(createMockEvent({ user: TEST_USER }));
		await expectResponseContract('GET', '/api/mcp/status', response);
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.connected).toBe(false);
	});

	test('reports connected when a client is authorized', async () => {
		mockClients = [{ clientId: 'claude-ai' }];
		const response = await GET(createMockEvent({ user: TEST_USER }));
		await expectResponseContract('GET', '/api/mcp/status', response);
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.connected).toBe(true);
	});
});
