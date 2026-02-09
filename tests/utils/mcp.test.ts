import { describe, expect, test } from 'bun:test';
import { createMcpServer } from '../../src/lib/server/mcp/server';

describe('createMcpServer', () => {
	test('creates a server instance', () => {
		const server = createMcpServer('test-user-id');
		expect(server).toBeTruthy();
	});
});
