import { describe, expect, test, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('$lib/server/db', () => ({ db: {} }));

const handlers = vi.hoisted(() => ({
	handleListRecipes: vi.fn(),
	handleListUnlabeledRecipes: vi.fn(),
	handleSetRecipeLabels: vi.fn(),
	handleSetRecipeLabelsBatch: vi.fn()
}));

vi.mock('$lib/server/mcp/handlers', async () => {
	const { toolNames } = await import('../../src/lib/server/mcp/tools');
	const stubs: Record<string, unknown> = {};
	for (const name of toolNames) {
		const handler = 'handle' + name.replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase());
		stubs[handler] = vi.fn();
	}
	return { ...stubs, ...handlers };
});

import { createMcpServer } from '../../src/lib/server/mcp/server';

const RECIPE_ID = '123e4567-e89b-12d3-a456-426614174000';

async function connect() {
	const server = createMcpServer('test-user');
	const client = new Client({ name: 'test', version: '0.0.0' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	return client;
}

describe('recipe label tools', () => {
	test('list_recipes forwards the search query', async () => {
		handlers.handleListRecipes.mockResolvedValue({ recipes: [] });
		const client = await connect();
		await client.callTool({ name: 'list_recipes', arguments: { query: 'soup' } });
		expect(handlers.handleListRecipes).toHaveBeenCalledWith('test-user', { query: 'soup' });
	});

	test('list_unlabeled_recipes forwards paging and the threshold', async () => {
		handlers.handleListUnlabeledRecipes.mockResolvedValue({ total: 0, recipes: [] });
		const client = await connect();
		await client.callTool({
			name: 'list_unlabeled_recipes',
			arguments: { minLabels: 3, limit: 20, offset: 40 }
		});
		expect(handlers.handleListUnlabeledRecipes).toHaveBeenCalledWith('test-user', {
			minLabels: 3,
			limit: 20,
			offset: 40
		});
	});

	test('set_recipe_labels forwards the recipe and labels', async () => {
		handlers.handleSetRecipeLabels.mockResolvedValue({ success: true });
		const client = await connect();
		await client.callTool({
			name: 'set_recipe_labels',
			arguments: { recipeId: RECIPE_ID, labels: ['soup'] }
		});
		expect(handlers.handleSetRecipeLabels).toHaveBeenCalledWith('test-user', {
			recipeId: RECIPE_ID,
			labels: ['soup']
		});
	});

	test('set_recipe_labels_batch forwards items and mode', async () => {
		handlers.handleSetRecipeLabelsBatch.mockResolvedValue({ results: [], labeled: 0 });
		const client = await connect();
		await client.callTool({
			name: 'set_recipe_labels_batch',
			arguments: { mode: 'replace', items: [{ recipeId: RECIPE_ID, labels: ['soup'] }] }
		});
		expect(handlers.handleSetRecipeLabelsBatch).toHaveBeenCalledWith('test-user', {
			mode: 'replace',
			items: [{ recipeId: RECIPE_ID, labels: ['soup'] }]
		});
	});

	test('rejects a non-uuid recipeId before the handler runs', async () => {
		handlers.handleSetRecipeLabels.mockClear();
		const client = await connect();
		const result = await client.callTool({
			name: 'set_recipe_labels',
			arguments: { recipeId: 'nope', labels: ['soup'] }
		});
		expect(result.isError).toBe(true);
		expect(handlers.handleSetRecipeLabels).not.toHaveBeenCalled();
	});
});
