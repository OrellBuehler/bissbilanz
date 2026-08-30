import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/lib/server/mcp/server';
import { foodCreateSchema } from '../../src/lib/server/validation/foods';
import { recipeCreateSchema } from '../../src/lib/server/validation/recipes';
import { goalsSchema } from '../../src/lib/server/validation/goals';
import { dayPropertiesSetSchema } from '../../src/lib/server/validation/day-properties';
import { foodLabelsBatchSchema } from '../../src/lib/server/validation/labels';

const server = createMcpServer('test-user');
const tools = (
	server as unknown as {
		_registeredTools: Record<string, { inputSchema?: z.ZodObject<z.ZodRawShape> }>;
	}
)._registeredTools;

const FOOD_BASE = {
	name: 'Oats',
	servingSize: 100,
	servingUnit: 'g',
	calories: 389,
	protein: 16.9,
	carbs: 66,
	fat: 6.9,
	fiber: 10.6
};

const AGREEMENT_CASES: Array<{ tool: string; rest: z.ZodType; payloads: unknown[] }> = [
	{
		tool: 'create_food',
		rest: foodCreateSchema,
		payloads: [
			FOOD_BASE,
			{ ...FOOD_BASE, name: '' },
			{ ...FOOD_BASE, servingSize: '100', calories: '389' },
			{ ...FOOD_BASE, servingSize: 0 },
			{ ...FOOD_BASE, imageUrl: 'javascript:alert(1)' },
			{ ...FOOD_BASE, imageUrl: '/uploads/oats.jpg' }
		]
	},
	{
		tool: 'create_recipe',
		rest: recipeCreateSchema,
		payloads: [
			{
				name: 'Porridge',
				totalServings: 2,
				ingredients: [
					{ foodId: '123e4567-e89b-12d3-a456-426614174000', quantity: 80, servingUnit: 'g' }
				]
			},
			{ name: 'Porridge', totalServings: 2, ingredients: [] },
			{ name: '', totalServings: 2, ingredients: [] },
			{
				name: 'Porridge',
				totalServings: 0,
				ingredients: [
					{ foodId: '123e4567-e89b-12d3-a456-426614174000', quantity: 80, servingUnit: 'g' }
				]
			}
		]
	},
	{
		tool: 'update_goals',
		rest: goalsSchema,
		payloads: [
			{ calorieGoal: 2200, proteinGoal: 150, carbGoal: 250, fatGoal: 70, fiberGoal: 30 },
			{ calorieGoal: 0, proteinGoal: 150, carbGoal: 250, fatGoal: 70, fiberGoal: 30 },
			{ calorieGoal: '2200', proteinGoal: '150', carbGoal: 250, fatGoal: 70, fiberGoal: 30 }
		]
	},
	{
		tool: 'set_day_properties',
		rest: dayPropertiesSetSchema,
		payloads: [
			{ date: '2026-06-09', isFastingDay: true },
			{ date: 'not-a-date', isFastingDay: true }
		]
	}
];

describe('MCP tool schemas agree with REST validation schemas', () => {
	for (const { tool, rest, payloads } of AGREEMENT_CASES) {
		test(tool, () => {
			const registered = tools[tool]?.inputSchema;
			expect(registered, `${tool} should have an inputSchema`).toBeDefined();
			const mcpSchema =
				typeof registered!.safeParse === 'function'
					? registered!
					: z.object(registered as unknown as z.ZodRawShape);
			for (const payload of payloads) {
				expect(
					mcpSchema.safeParse(payload).success,
					`${tool} disagrees with REST on ${JSON.stringify(payload)}`
				).toBe(rest.safeParse(payload).success);
			}
		});
	}
});

describe('food label caps agree with REST', () => {
	const FOOD_ID = '123e4567-e89b-12d3-a456-426614174000';
	const item = (labels: number) => ({
		foodId: FOOD_ID,
		labels: Array.from({ length: labels }, (_, i) => `label${i}`)
	});
	const mcpSchema = () => {
		const registered = tools.set_food_labels_batch?.inputSchema;
		expect(registered, 'set_food_labels_batch should have an inputSchema').toBeDefined();
		return typeof registered!.safeParse === 'function'
			? registered!
			: z.object(registered as unknown as z.ZodRawShape);
	};

	for (const [name, payload] of [
		['one item', { items: [item(3)] }],
		['21 labels on a food', { items: [item(21)] }],
		['101 items', { items: Array.from({ length: 101 }, () => item(1)) }],
		['a non-uuid foodId', { items: [{ foodId: 'nope', labels: ['banana'] }] }]
	] as const) {
		test(name, () => {
			expect(mcpSchema().safeParse(payload).success).toBe(
				foodLabelsBatchSchema.safeParse(payload).success
			);
		});
	}
});

describe('tools/list serialization', () => {
	test('derived schemas (coerce/transform) serialize to JSON Schema', async () => {
		const srv = createMcpServer('test-user');
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		const client = new Client({ name: 'drift-test', version: '0.0.0' });
		await Promise.all([client.connect(clientTransport), srv.connect(serverTransport)]);
		const { tools: listed } = await client.listTools();

		for (const name of ['create_food', 'log_food', 'update_entry', 'log_weight', 'log_sleep']) {
			const tool = listed.find((t) => t.name === name);
			expect(tool, `${name} missing from tools/list`).toBeDefined();
			expect(Object.keys(tool!.inputSchema.properties ?? {}).length).toBeGreaterThan(0);
		}

		const createFood = listed.find((t) => t.name === 'create_food')!;
		expect(createFood.inputSchema.properties).toHaveProperty('name');
		expect(createFood.inputSchema.properties).toHaveProperty('servingSize');
		await client.close();
	});
});
