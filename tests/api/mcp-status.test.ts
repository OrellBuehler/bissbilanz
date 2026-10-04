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
		mockClients = [{ clientId: 'claude-ai', clientName: 'Claude' }];
		const response = await GET(createMockEvent({ user: TEST_USER }));
		await expectResponseContract('GET', '/api/mcp/status', response);
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.connected).toBe(true);
	});

	test('lists no clients when none is authorized', async () => {
		const response = await GET(createMockEvent({ user: TEST_USER }));
		const data = await response.json();
		expect(data.clients).toEqual([]);
	});

	test('names each client and reports the metadata host for URL client ids', async () => {
		mockClients = [
			{ clientId: 'https://claude.ai/oauth/mcp-oauth-client-metadata', clientName: 'Claude' },
			{ clientId: 'https://chatgpt.com/cimd/abc', clientName: null },
			{ clientId: 'bb_pre_registered', clientName: 'My script' },
			{ clientId: 'bb_unnamed', clientName: null }
		];
		const response = await GET(createMockEvent({ user: TEST_USER }));
		await expectResponseContract('GET', '/api/mcp/status', response);
		const data = await response.json();
		expect(data.connected).toBe(true);
		expect(data.clients).toEqual([
			{ name: 'Claude', host: 'claude.ai' },
			{ name: 'https://chatgpt.com/cimd/abc', host: 'chatgpt.com' },
			{ name: 'My script', host: null },
			{ name: 'bb_unnamed', host: null }
		]);
	});
});
