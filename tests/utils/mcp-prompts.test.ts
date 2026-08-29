import { describe, expect, test, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/lib/server/mcp/server';

vi.mock('$lib/server/db', () => ({ db: {} }));

async function connect() {
	const server = createMcpServer('test-user');
	const client = new Client({ name: 'test', version: '0.0.0' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	return client;
}

describe('MCP prompts', () => {
	test('lists the three workflow prompts with titles', async () => {
		const client = await connect();
		const { prompts } = await client.listPrompts();
		const byName = Object.fromEntries(prompts.map((p) => [p.name, p]));
		expect(Object.keys(byName).sort()).toEqual(['daily_review', 'log_meal', 'weekly_review']);
		for (const p of prompts) expect(p.title, `${p.name} title`).toBeTruthy();
		const logMealArgs = byName.log_meal.arguments ?? [];
		expect(logMealArgs.find((a) => a.name === 'description')?.required).toBe(true);
		expect(logMealArgs.find((a) => a.name === 'mealType')?.required).toBeFalsy();
	});

	test('log_meal embeds the description, meal type and date', async () => {
		const client = await connect();
		const result = await client.getPrompt({
			name: 'log_meal',
			arguments: { description: 'two eggs and toast', mealType: 'Breakfast', date: '2026-08-01' }
		});
		const text = result.messages[0].content.type === 'text' ? result.messages[0].content.text : '';
		expect(result.messages[0].role).toBe('user');
		expect(text).toContain('two eggs and toast');
		expect(text).toContain('under "Breakfast"');
		expect(text).toContain('for 2026-08-01');
		expect(text).toContain('search_foods');
	});

	test('daily_review defaults to today', async () => {
		const client = await connect();
		const result = await client.getPrompt({ name: 'daily_review', arguments: {} });
		const text = result.messages[0].content.type === 'text' ? result.messages[0].content.text : '';
		expect(text).toContain('for today');
		expect(text).toContain('get_daily_status');
	});

	test('mealType completes from the default meal types', async () => {
		const client = await connect();
		const result = await client.complete({
			ref: { type: 'ref/prompt', name: 'log_meal' },
			argument: { name: 'mealType', value: 'S' }
		});
		expect(result.completion.values).toEqual(['Snacks']);
	});

	test('server advertises instructions', async () => {
		const client = await connect();
		expect(client.getInstructions()).toContain('YYYY-MM-DD');
	});
});
