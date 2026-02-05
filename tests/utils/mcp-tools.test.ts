import { describe, expect, test } from 'bun:test';
import { toolNames } from '../../src/lib/server/mcp/tools';

describe('toolNames', () => {
	test('includes get-daily-status', () => {
		expect(toolNames).toContain('get-daily-status');
	});

	test('includes all required tools', () => {
		expect(toolNames).toContain('create-food');
		expect(toolNames).toContain('create-recipe');
		expect(toolNames).toContain('log-food');
		expect(toolNames).toContain('search-foods');
	});
});
