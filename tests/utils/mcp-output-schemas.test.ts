import { describe, expect, test, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('$lib/server/db', () => ({ db: {} }));

const handlers = vi.hoisted(() => ({
	handleGetStreaks: vi.fn(),
	handleGetGoals: vi.fn(),
	handleGetDailyStatus: vi.fn(),
	handleGetWeight: vi.fn(),
	handleGetTopFoods: vi.fn()
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
import { TOOL_OUTPUT } from '../../src/lib/server/mcp/output-schemas';

async function connect() {
	const server = createMcpServer('test-user');
	const client = new Client({ name: 'test', version: '0.0.0' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	return client;
}

const dailyStatus = {
	totals: { calories: 1200, protein: 80, carbs: 100, fat: 40, fiber: 20 },
	goals: {
		id: 'g1',
		calorieGoal: 2200,
		proteinGoal: 160,
		carbGoal: 220,
		fatGoal: 70,
		fiberGoal: 30,
		createdAt: new Date('2026-01-01')
	},
	progress: { calories: 55, protein: 50, carbs: 45, fat: 57, fiber: 67 },
	entryCount: 3,
	byMeal: { Breakfast: { calories: 1200, protein: 80, carbs: 100, fat: 40, fiber: 20 } }
};

describe('tool output schemas', () => {
	test('every tool with an output schema is registered and every registered tool has a title', async () => {
		const client = await connect();
		const { tools } = await client.listTools();
		const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
		for (const name of Object.keys(TOOL_OUTPUT)) {
			expect(byName[name]?.outputSchema, `${name} outputSchema`).toBeDefined();
		}
		for (const tool of tools) expect(tool.title, `${tool.name} title`).toBeTruthy();
	});

	test('structuredContent passes validation and mirrors the text block', async () => {
		handlers.handleGetStreaks.mockResolvedValue({ currentStreak: 3, longestStreak: 9 });
		const client = await connect();
		const result = await client.callTool({ name: 'get_streaks', arguments: {} });
		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toEqual({ currentStreak: 3, longestStreak: 9 });
	});

	test('Date values are serialised before validation', async () => {
		handlers.handleGetDailyStatus.mockResolvedValue({ ...dailyStatus, date: '2026-08-29' });
		const client = await connect();
		const result = await client.callTool({ name: 'get_daily_status', arguments: {} });
		expect(result.isError).toBeFalsy();
		const goals = (result.structuredContent as typeof dailyStatus).goals;
		expect(goals.createdAt).toBe('2026-01-01T00:00:00.000Z');
	});

	test('error payloads are flagged isError and skip output validation', async () => {
		handlers.handleGetGoals.mockResolvedValue({ error: 'boom' });
		const client = await connect();
		const result = await client.callTool({ name: 'get_goals', arguments: {} });
		expect(result.isError).toBe(true);
		expect(result.structuredContent).toEqual({ error: 'boom' });
	});

	test('tools without an output schema still return structuredContent for objects', async () => {
		handlers.handleGetWeight.mockResolvedValue({ weightKg: 79.5, entryDate: '2026-08-29' });
		const client = await connect();
		const result = await client.callTool({ name: 'get_weight', arguments: {} });
		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toEqual({ weightKg: 79.5, entryDate: '2026-08-29' });
	});

	test('array payloads are text-only', async () => {
		handlers.handleGetTopFoods.mockResolvedValue([{ foodName: 'Oats', count: 5 }]);
		const client = await connect();
		const result = await client.callTool({ name: 'get_top_foods', arguments: {} });
		expect(result.structuredContent).toBeUndefined();
	});
});
