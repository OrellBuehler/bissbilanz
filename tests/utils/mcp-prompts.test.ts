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
	test('lists the workflow prompts with titles', async () => {
		const client = await connect();
		const { prompts } = await client.listPrompts();
		const byName = Object.fromEntries(prompts.map((p) => [p.name, p]));
		expect(Object.keys(byName).sort()).toEqual([
			'daily_review',
			'label_foods',
			'log_meal',
			'meal_plan',
			'weekly_review'
		]);
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

	test('meal_plan chains the planning tools and forbids writes', async () => {
		const client = await connect();
		const result = await client.getPrompt({
			name: 'meal_plan',
			arguments: { startDate: '2026-09-01', days: '5', focus: 'iron' }
		});
		const text = result.messages[0].content.type === 'text' ? result.messages[0].content.text : '';
		expect(text).toContain('5-day');
		expect(text).toContain('starting 2026-09-01');
		expect(text).toContain('Focus on: iron.');
		expect(text).toContain('get_meal_plan_context');
		expect(text).toContain('get_nutrient_gaps');
		expect(text).toContain('find_nutrient_sources');
		expect(text).toContain('Do not log anything');
	});

	test('meal_plan defaults to seven days from tomorrow', async () => {
		const client = await connect();
		const result = await client.getPrompt({ name: 'meal_plan', arguments: {} });
		const text = result.messages[0].content.type === 'text' ? result.messages[0].content.text : '';
		expect(text).toContain('seven-day');
		expect(text).toContain('starting tomorrow');
		expect(text).not.toContain('Focus on:');
	});

	test('daily_review defaults to today', async () => {
		const client = await connect();
		const result = await client.getPrompt({ name: 'daily_review', arguments: {} });
		const text = result.messages[0].content.type === 'text' ? result.messages[0].content.text : '';
		expect(text).toContain('for today');
		expect(text).toContain('get_daily_status');
	});

	test('label_foods states the en_US rule and names both tools', async () => {
		const client = await connect();
		const result = await client.getPrompt({ name: 'label_foods', arguments: {} });
		const text = result.messages[0].content.type === 'text' ? result.messages[0].content.text : '';
		expect(text).toContain('list_unlabeled_foods');
		expect(text).toContain('set_food_labels_batch');
		// The whole feature hinges on this: a German user's "Banane" must still
		// carry the label "banana", or the camera can never match it.
		expect(text).toContain('Banane');
		expect(text).toContain('English');
	});

	test('label_foods scopes the sweep when a limit is given', async () => {
		const client = await connect();
		const result = await client.getPrompt({ name: 'label_foods', arguments: { limit: '25' } });
		const text = result.messages[0].content.type === 'text' ? result.messages[0].content.text : '';
		expect(text).toContain('up to 25');
		expect(text).toContain('limit=25');
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
