import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('$lib/server/db', () => ({ db: {} }));

const NEW_TOOLS = [
	'list_fasts',
	'log_fast',
	'update_fast',
	'delete_fast',
	'list_reminders',
	'create_reminder',
	'update_reminder',
	'delete_reminder',
	'get_preferences',
	'update_preferences',
	'create_meal_type',
	'update_meal_type',
	'delete_meal_type',
	'get_food_usage',
	'get_recipe_usage',
	'list_food_brands',
	'search_nutrient_database'
] as const;

const handlers = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);

vi.mock('$lib/server/mcp/handlers', async () => {
	const { toolNames } = await import('../../src/lib/server/mcp/tools');
	const stubs: Record<string, unknown> = {};
	for (const name of toolNames) {
		const fn = vi.fn().mockResolvedValue({ success: true });
		stubs['handle' + name.replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase())] = fn;
		handlers[name] = fn;
	}
	return stubs;
});

import { createMcpServer } from '../../src/lib/server/mcp/server';

const ID = '6f1c0f0e-0c1e-4a52-9d4e-6f4d2a0a7a01';

async function call(name: string, args: Record<string, unknown>) {
	const server = createMcpServer('test-user');
	const client = new Client({ name: 'test', version: '0.0.0' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	try {
		return await client.callTool({ name, arguments: args });
	} finally {
		await client.close();
		await server.close();
	}
}

beforeEach(() => {
	for (const fn of Object.values(handlers)) fn.mockClear();
});

describe('assistant gap tools', () => {
	test('every new tool reaches its handler with the caller’s user id', async () => {
		const args: Record<(typeof NEW_TOOLS)[number], Record<string, unknown>> = {
			list_fasts: { from: '2026-11-01T00:00:00+01:00', limit: 5 },
			log_fast: {
				startedAt: '2026-11-18T20:00:00+01:00',
				endedAt: '2026-11-19T12:00:00+01:00',
				targetHours: 16
			},
			update_fast: { fastId: ID, targetHours: 18 },
			delete_fast: { fastId: ID },
			list_reminders: {},
			create_reminder: { kind: 'weight', time: '07:30' },
			update_reminder: { reminderId: ID, enabled: false },
			delete_reminder: { reminderId: ID },
			get_preferences: {},
			update_preferences: { waterGoalMl: 2500 },
			create_meal_type: { name: 'Pre-workout' },
			update_meal_type: { mealTypeId: ID, name: 'Pre-training' },
			delete_meal_type: { mealTypeId: ID },
			get_food_usage: { foodId: ID, limit: 10 },
			get_recipe_usage: { recipeId: ID },
			list_food_brands: { query: 'migros', limit: 10 },
			search_nutrient_database: { query: ' pear raw ' }
		};
		for (const tool of NEW_TOOLS) {
			const result = await call(tool, args[tool]);
			expect(result.isError, tool).toBeFalsy();
			expect(handlers[tool], tool).toHaveBeenCalledTimes(1);
			expect(handlers[tool]!.mock.calls[0]![0], tool).toBe('test-user');
		}
		expect(handlers.search_nutrient_database!.mock.calls[0]![1]).toEqual({ query: 'pear raw' });
		expect(handlers.list_food_brands!.mock.calls[0]![1]).toEqual({ query: 'migros', limit: 10 });
		expect(handlers.create_reminder!.mock.calls[0]![1]).toEqual({
			kind: 'weight',
			time: '07:30',
			weekdays: [0, 1, 2, 3, 4, 5, 6]
		});
	});

	test('update_preferences drops fields outside the allowlist before the handler runs', async () => {
		await call('update_preferences', {
			showChartWidget: false,
			locale: 'de',
			timeZone: 'Asia/Tokyo',
			aiTaskProcessor: 'claude',
			aiTaskAutoLog: true,
			biologicalSex: 'female',
			showDayPropertiesWidget: false
		});
		expect(handlers.update_preferences!.mock.calls[0]![1]).toEqual({ showChartWidget: false });
	});

	test('rejects malformed ids and instants before the handler runs', async () => {
		for (const [tool, args] of [
			['delete_fast', { fastId: 'nope' }],
			['delete_reminder', { reminderId: 'nope' }],
			['delete_meal_type', { mealTypeId: 'nope' }],
			['log_fast', { startedAt: 'yesterday', endedAt: 'today', targetHours: 16 }],
			['create_reminder', { kind: 'weight', time: '7:30' }],
			['search_nutrient_database', { query: '   ' }],
			['create_meal_type', { name: 'Brunch', sortOrder: 2_147_483_648 }],
			['update_meal_type', { mealTypeId: ID, sortOrder: 2_147_483_648 }]
		] as const) {
			const result = await call(tool, args);
			expect(result.isError, tool).toBe(true);
			expect(handlers[tool], tool).not.toHaveBeenCalled();
		}
	});
});
