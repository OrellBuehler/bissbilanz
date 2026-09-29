import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from '$lib/server/schema';
import {
	closeTestDB,
	createTestDatabase,
	dropTestDatabase,
	getTestDB,
	runTestMigrations
} from './helpers';
import {
	D1,
	D2,
	EAN,
	arrangeBOwn,
	collectAIds,
	createWorld,
	foreignReferences,
	resetDatabase,
	seeders,
	snapshot,
	stripEchoed,
	type TestDB,
	type World
} from './isolation-helpers';

const DB_NAME = 'test_isolation_mcp';
const RANGE = { startDate: '2026-03-01', endDate: '2026-03-31' };

type ToolResult = { isError: boolean; text: string; payload: any };

type ToolProbe = {
	name: string;
	tool: string;
	args: (w: World) => Record<string, unknown>;
	arrange?: (w: World) => Promise<void>;
	/** `rejected`: the tool must report an error. `either`: an error or a harmless no-op, A's data untouched. */
	outcome?: 'rejected' | 'either';
	/** Read tools: the attacker must see exactly what an account without data sees, and the owner must not. */
	emptyLike?: boolean;
	control?: ((w: World) => Record<string, unknown>) | null;
	check?: (result: ToolResult, w: World) => void | Promise<void>;
};

type Resource = {
	name: string;
	seed?: (w: World) => Promise<void>;
	probes: ToolProbe[];
};

let dbUrl: string;
let uploadDir: string;
let db: TestDB;
let w: World;

const callTool = async (
	userId: string,
	name: string,
	args: Record<string, unknown>
): Promise<ToolResult> => {
	const { createMcpServer } = await import('$lib/server/mcp/server');
	const server = createMcpServer(userId);
	const client = new Client({ name: 'isolation', version: '0.0.0' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	try {
		const result = await client.callTool({ name, arguments: args });
		const text = (result.content as { type: string; text?: string }[])
			.filter((part) => part.type === 'text')
			.map((part) => part.text ?? '')
			.join('\n');
		let payload = result.structuredContent ?? null;
		if (payload === null) {
			try {
				payload = JSON.parse(text);
			} catch {
				payload = null;
			}
		}
		return { isError: result.isError === true, text, payload };
	} finally {
		await client.close();
		await server.close();
	}
};

const rejected = (result: ToolResult) =>
	result.isError || typeof result.payload?.error === 'string';

const describeResult = (result: ToolResult) =>
	`isError=${result.isError}: ${result.text.slice(0, 300)}`;

const foodBody = (extra: Record<string, unknown> = {}) => ({
	name: 'isoB-created',
	servingSize: 100,
	servingUnit: 'g',
	calories: 100,
	protein: 1,
	carbs: 1,
	fat: 1,
	fiber: 1,
	...extra
});

const resources: Resource[] = [
	{
		name: 'foods',
		seed: seeders.foods,
		probes: [
			{ name: 'get_food', tool: 'get_food', args: (w) => ({ foodId: w.a.food }) },
			{
				name: 'update_food',
				tool: 'update_food',
				args: (w) => ({ foodId: w.a.food, name: 'isoB-hijacked', isFavorite: false })
			},
			{
				name: 'update_food barcode',
				tool: 'update_food',
				args: (w) => ({ foodId: w.a.foodLoose, barcode: '9780201379624' })
			},
			{
				name: 'delete_food unused with force',
				tool: 'delete_food',
				args: (w) => ({ foodId: w.a.foodLoose, force: true }),
				outcome: 'either'
			},
			{
				name: 'delete_food used by entries and recipes reports no usage',
				tool: 'delete_food',
				args: (w) => ({ foodId: w.a.food }),
				outcome: 'either',
				check: (result) => {
					expect(result.payload?.blocked).not.toBe(true);
					expect(result.text).not.toMatch(/entryCount|ingredientCount|recipeCount/);
				}
			},
			{
				name: 'delete_food supplement backing food reports no usage',
				tool: 'delete_food',
				args: (w) => ({ foodId: w.a.suppFood }),
				outcome: 'either',
				check: (result) => {
					expect(result.payload?.blocked).not.toBe(true);
					expect(result.text).not.toMatch(/supplementIngredientCount/);
				}
			},
			{
				name: 'search_foods',
				tool: 'search_foods',
				args: () => ({ query: 'isoA' }),
				emptyLike: true
			},
			{
				name: 'find_food_by_barcode',
				tool: 'find_food_by_barcode',
				args: () => ({ barcode: EAN }),
				emptyLike: true
			},
			{
				name: 'list_recent_foods',
				tool: 'list_recent_foods',
				args: () => ({}),
				emptyLike: true
			},
			{
				name: 'find_duplicate_foods',
				tool: 'find_duplicate_foods',
				args: () => ({}),
				emptyLike: true
			},
			{ name: 'list_favorites', tool: 'list_favorites', args: () => ({}), emptyLike: true },
			{
				name: 'list_unlabeled_foods',
				tool: 'list_unlabeled_foods',
				args: () => ({ minLabels: 5 }),
				emptyLike: true
			},
			{ name: 'list_labels', tool: 'list_labels', args: () => ({}), emptyLike: true },
			{
				name: 'set_food_labels',
				tool: 'set_food_labels',
				args: (w) => ({ foodId: w.a.food, labels: ['isobhijack'] })
			},
			{
				name: 'set_food_labels machine source',
				tool: 'set_food_labels',
				args: (w) => ({ foodId: w.a.food, labels: ['isobhijack'], source: 'llm', mode: 'extend' })
			},
			{
				name: 'set_food_labels_batch',
				tool: 'set_food_labels_batch',
				args: (w) => ({ items: [{ foodId: w.a.food, labels: ['isobhijack'] }] }),
				outcome: 'either',
				check: (result) => {
					const results = result.payload?.results;
					if (Array.isArray(results)) expect(results.every((r: any) => r.ok === false)).toBe(true);
					else expect(rejected(result)).toBe(true);
				}
			},
			{
				name: 'merge_foods between foreign foods',
				tool: 'merge_foods',
				args: (w) => ({ keeperId: w.a.foodKeeper, sourceIds: [w.a.foodSource] })
			},
			{
				name: 'merge_foods foreign source into own keeper',
				tool: 'merge_foods',
				arrange: (w) => arrangeBOwn(w, []),
				args: (w) => ({ keeperId: w.b.food, sourceIds: [w.a.foodSource] }),
				control: (w) => ({ keeperId: w.a.foodKeeper, sourceIds: [w.a.foodSource] })
			},
			{
				name: 'merge_foods own source into foreign keeper',
				tool: 'merge_foods',
				arrange: (w) => arrangeBOwn(w, []),
				args: (w) => ({ keeperId: w.a.foodKeeper, sourceIds: [w.b.food] }),
				control: (w) => ({ keeperId: w.a.foodKeeper, sourceIds: [w.a.foodSource] })
			},
			{
				name: 'create_food with a barcode another user holds',
				tool: 'create_food',
				args: () => foodBody({ barcode: EAN }),
				control: () => foodBody(),
				outcome: 'either',
				check: (result) => expect(rejected(result)).toBe(false)
			}
		]
	},
	{
		name: 'recipes',
		seed: seeders.recipes,
		probes: [
			{ name: 'get_recipe', tool: 'get_recipe', args: (w) => ({ recipeId: w.a.recipe }) },
			{ name: 'list_recipes', tool: 'list_recipes', args: () => ({}), emptyLike: true },
			{
				name: 'update_recipe name',
				tool: 'update_recipe',
				args: (w) => ({ recipeId: w.a.recipe, name: 'isoB-hijacked' })
			},
			{
				name: 'update_recipe ingredients and steps',
				tool: 'update_recipe',
				arrange: (w) => arrangeBOwn(w, []),
				args: (w) => ({
					recipeId: w.a.recipe,
					ingredients: [{ foodId: w.b.food, quantity: 1, servingUnit: 'g' }],
					steps: [{ text: 'isoB-step' }]
				}),
				control: (w) => ({
					recipeId: w.a.recipe,
					ingredients: [{ foodId: w.a.foodLoose, quantity: 1, servingUnit: 'g' }],
					steps: [{ text: 'isoA-step-2' }]
				})
			},
			{
				name: 'update_recipe own recipe with a foreign ingredient',
				tool: 'update_recipe',
				arrange: (w) => arrangeBOwn(w, ['recipe']),
				args: (w) => ({
					recipeId: w.b.recipe,
					ingredients: [{ foodId: w.a.food, quantity: 1, servingUnit: 'g' }]
				}),
				control: (w) => ({
					recipeId: w.a.recipe,
					ingredients: [{ foodId: w.a.foodLoose, quantity: 1, servingUnit: 'g' }]
				})
			},
			{
				name: 'delete_recipe',
				tool: 'delete_recipe',
				args: (w) => ({ recipeId: w.a.recipe }),
				outcome: 'either'
			},
			{
				name: 'delete_recipe with force',
				tool: 'delete_recipe',
				args: (w) => ({ recipeId: w.a.recipe, force: true }),
				outcome: 'either'
			},
			{
				name: 'create_recipe with a foreign ingredient',
				tool: 'create_recipe',
				args: (w) => ({
					name: 'isoB-stolen',
					totalServings: 1,
					ingredients: [{ foodId: w.a.food, quantity: 1, servingUnit: 'g' }]
				}),
				control: (w) => ({
					name: 'isoA-second',
					totalServings: 1,
					ingredients: [{ foodId: w.a.food, quantity: 1, servingUnit: 'g' }]
				})
			}
		]
	},
	{
		name: 'entries',
		seed: seeders.entries,
		probes: [
			{
				name: 'list_entries',
				tool: 'list_entries',
				args: () => ({ date: D1 }),
				emptyLike: true
			},
			{
				name: 'get_daily_status with entries',
				tool: 'get_daily_status',
				args: () => ({ date: D1, includeEntries: true }),
				emptyLike: true
			},
			{
				name: 'update_entry',
				tool: 'update_entry',
				args: (w) => ({ entryId: w.a.entry, servings: 99, notes: 'isoB-hijacked' })
			},
			{
				name: 'update_entry quick entry',
				tool: 'update_entry',
				args: (w) => ({ entryId: w.a.quickEntry, quickCalories: 1 })
			},
			{
				name: 'update_entry own entry to a foreign food',
				tool: 'update_entry',
				arrange: (w) => arrangeBOwn(w, ['entry']),
				args: (w) => ({ entryId: w.b.entry, foodId: w.a.food }),
				control: (w) => ({ entryId: w.a.entry, foodId: w.a.foodLoose })
			},
			{
				name: 'update_entry own entry to a foreign recipe',
				tool: 'update_entry',
				arrange: (w) => arrangeBOwn(w, ['entry']),
				args: (w) => ({ entryId: w.b.entry, recipeId: w.a.recipe }),
				control: (w) => ({ entryId: w.a.entry, recipeId: w.a.recipe })
			},
			{
				name: 'update_entry own entry to another user’s custom meal type',
				tool: 'update_entry',
				arrange: (w) => arrangeBOwn(w, ['entry']),
				args: (w) => ({ entryId: w.b.entry, mealType: 'isoA-Meal' }),
				control: (w) => ({ entryId: w.a.entry, mealType: 'isoA-Meal' })
			},
			{
				name: 'delete_entry',
				tool: 'delete_entry',
				args: (w) => ({ entryId: w.a.entry, date: D1 }),
				outcome: 'either'
			},
			{
				name: 'delete_entry supplement log',
				tool: 'delete_entry',
				args: (w) => ({ entryId: w.a.todayEntry }),
				outcome: 'either'
			},
			{
				name: 'log_food for a foreign food',
				tool: 'log_food',
				args: (w) => ({ foodId: w.a.food, mealType: 'Lunch', servings: 1, date: D1 })
			},
			{
				name: 'log_food for a foreign recipe',
				tool: 'log_food',
				args: (w) => ({ recipeId: w.a.recipe, mealType: 'Lunch', servings: 1, date: D1 })
			},
			{
				name: 'log_food with another user’s custom meal type',
				tool: 'log_food',
				arrange: (w) => arrangeBOwn(w, []),
				args: (w) => ({ foodId: w.b.food, mealType: 'isoA-Meal', servings: 1, date: D1 }),
				control: (w) => ({ foodId: w.a.food, mealType: 'isoA-Meal', servings: 1, date: D1 })
			},
			{
				name: 'copy_entries',
				tool: 'copy_entries',
				args: () => ({ fromDate: D1, toDate: D2 }),
				outcome: 'either',
				check: (result) => {
					const count = result.payload?.count ?? result.payload?.copied ?? 0;
					expect(count).toBe(0);
				}
			}
		]
	},
	{
		name: 'weight',
		seed: seeders.weight,
		probes: [
			{ name: 'get_weight latest', tool: 'get_weight', args: () => ({}), emptyLike: true },
			{
				name: 'get_weight trend',
				tool: 'get_weight',
				args: () => ({ from: RANGE.startDate, to: RANGE.endDate }),
				emptyLike: true
			},
			{
				name: 'update_weight',
				tool: 'update_weight',
				args: (w) => ({ weightId: w.a.weight, weightKg: 50 })
			},
			{
				name: 'delete_weight',
				tool: 'delete_weight',
				args: (w) => ({ weightId: w.a.weight })
			},
			{
				name: 'log_weight on a date another user already logged',
				tool: 'log_weight',
				args: () => ({ weightKg: 70, entryDate: D1, date: D1 }),
				outcome: 'either',
				control: null
			}
		]
	},
	{
		name: 'sleep',
		seed: seeders.sleep,
		probes: [
			{ name: 'get_sleep', tool: 'get_sleep', args: () => ({}), emptyLike: true },
			{
				name: 'get_sleep range',
				tool: 'get_sleep',
				args: () => ({ from: RANGE.startDate, to: RANGE.endDate }),
				emptyLike: true
			},
			{
				name: 'update_sleep',
				tool: 'update_sleep',
				args: (w) => ({ id: w.a.sleep, quality: 1 })
			},
			{ name: 'delete_sleep', tool: 'delete_sleep', args: (w) => ({ id: w.a.sleep }) },
			{
				name: 'log_sleep on a date another user already logged',
				tool: 'log_sleep',
				args: () => ({ durationMinutes: 400, quality: 5, date: D1 }),
				outcome: 'either',
				control: null
			}
		]
	},
	{
		name: 'supplements',
		seed: seeders.supplements,
		probes: [
			{
				name: 'list_supplements',
				tool: 'list_supplements',
				args: () => ({ activeOnly: false }),
				emptyLike: true
			},
			{
				name: 'get_supplement_status',
				tool: 'get_supplement_status',
				args: () => ({ date: D1 }),
				emptyLike: true
			},
			{
				name: 'get_supplement_history',
				tool: 'get_supplement_history',
				args: () => ({ from: '2026-01-01', to: '2026-12-31' }),
				emptyLike: true
			},
			{
				name: 'log_supplement by id',
				tool: 'log_supplement',
				args: (w) => ({ supplementId: w.a.supp, date: D2 })
			},
			{
				name: 'log_supplement by name',
				tool: 'log_supplement',
				args: () => ({ name: 'isoA-Supp', date: D2 })
			},
			{
				name: 'unlog_supplement',
				tool: 'unlog_supplement',
				args: (w) => ({ supplementId: w.a.supp, date: D1 }),
				outcome: 'either'
			},
			{
				name: 'update_supplement',
				tool: 'update_supplement',
				args: (w) => ({ supplementId: w.a.supp, name: 'isoB-hijacked', isActive: false })
			},
			{
				name: 'update_supplement ingredients',
				tool: 'update_supplement',
				arrange: (w) => arrangeBOwn(w, []),
				args: (w) => ({
					supplementId: w.a.supp,
					ingredients: [{ foodId: w.b.food, servings: 1 }]
				}),
				control: (w) => ({
					supplementId: w.a.supp,
					ingredients: [{ foodId: w.a.foodLoose, servings: 1 }]
				})
			},
			{
				name: 'update_supplement own supplement with a foreign ingredient food',
				tool: 'update_supplement',
				arrange: (w) => arrangeBOwn(w, ['supp']),
				args: (w) => ({ supplementId: w.b.supp, ingredients: [{ foodId: w.a.food, servings: 1 }] }),
				control: (w) => ({
					supplementId: w.a.supp,
					ingredients: [{ foodId: w.a.foodLoose, servings: 1 }]
				})
			},
			{
				name: 'delete_supplement',
				tool: 'delete_supplement',
				args: (w) => ({ supplementId: w.a.supp }),
				outcome: 'either'
			},
			{
				name: 'create_supplement with a foreign ingredient food',
				tool: 'create_supplement',
				args: (w) => ({
					name: 'isoB-stolen',
					scheduleType: 'daily',
					ingredients: [{ foodId: w.a.suppFood, servings: 1 }]
				}),
				control: (w) => ({
					name: 'isoA-second',
					scheduleType: 'daily',
					ingredients: [{ foodId: w.a.suppFood, servings: 1 }]
				})
			}
		]
	},
	{
		name: 'ai tasks',
		seed: seeders.aiTasks,
		probes: [
			{ name: 'list_ai_tasks', tool: 'list_ai_tasks', args: () => ({}), emptyLike: true },
			{
				name: 'list_ai_tasks pending',
				tool: 'list_ai_tasks',
				args: () => ({ status: 'pending' }),
				emptyLike: true
			},
			{ name: 'get_ai_task', tool: 'get_ai_task', args: (w) => ({ id: w.a.task }) },
			{
				name: 'complete_ai_task',
				tool: 'complete_ai_task',
				args: (w) => ({ id: w.a.task, resultSummary: 'isoB-hijacked', entryIds: [w.a.entry] })
			},
			{
				name: 'dismiss_ai_task',
				tool: 'dismiss_ai_task',
				args: (w) => ({ id: w.a.task, reason: 'isoB-hijacked' })
			}
		]
	},
	{
		name: 'day properties',
		seed: seeders.dayProperties,
		probes: [
			{
				name: 'get_day_properties',
				tool: 'get_day_properties',
				args: () => ({ date: D1 }),
				emptyLike: true
			},
			{
				name: 'set_day_properties writes only the caller’s own day',
				tool: 'set_day_properties',
				args: () => ({ date: D1, notes: 'isoB-note', isFastingDay: false, waterMl: 1 }),
				outcome: 'either',
				check: (result) => expect(rejected(result)).toBe(false)
			},
			{
				name: 'delete_day_properties',
				tool: 'delete_day_properties',
				args: () => ({ date: D1 }),
				outcome: 'either'
			}
		]
	},
	{
		name: 'goals',
		seed: seeders.goals,
		probes: [
			{ name: 'get_goals', tool: 'get_goals', args: () => ({}), emptyLike: true },
			{
				name: 'update_goals writes only the caller’s own goals',
				tool: 'update_goals',
				args: () => ({
					calorieGoal: 1,
					proteinGoal: 1,
					carbGoal: 1,
					fatGoal: 1,
					fiberGoal: 1
				}),
				outcome: 'either',
				check: (result) => expect(rejected(result)).toBe(false)
			}
		]
	},
	{
		name: 'meal types',
		seed: seeders.mealTypes,
		probes: [
			{ name: 'list_meal_types', tool: 'list_meal_types', args: () => ({}), emptyLike: true }
		]
	},
	{
		name: 'stats and analytics',
		probes: [
			{
				name: 'get_weekly_stats',
				tool: 'get_weekly_stats',
				args: () => ({}),
				emptyLike: true
			},
			{
				name: 'get_weekly_stats custom range',
				tool: 'get_weekly_stats',
				args: () => RANGE,
				emptyLike: true
			},
			{
				name: 'get_monthly_stats',
				tool: 'get_monthly_stats',
				args: () => ({}),
				emptyLike: true
			},
			{
				name: 'get_daily_breakdown',
				tool: 'get_daily_breakdown',
				args: () => RANGE,
				emptyLike: true
			},
			{
				name: 'get_meal_breakdown',
				tool: 'get_meal_breakdown',
				args: () => RANGE,
				emptyLike: true
			},
			{
				name: 'get_top_foods',
				tool: 'get_top_foods',
				args: () => ({ days: 365 }),
				emptyLike: true
			},
			{ name: 'get_streaks', tool: 'get_streaks', args: () => ({}), emptyLike: true },
			{
				name: 'get_maintenance_calories',
				tool: 'get_maintenance_calories',
				args: () => RANGE,
				emptyLike: true
			},
			{
				name: 'get_calendar_stats',
				tool: 'get_calendar_stats',
				args: () => ({ month: '2026-03' }),
				emptyLike: true
			},
			{
				name: 'get_food_diversity',
				tool: 'get_food_diversity',
				args: () => RANGE,
				emptyLike: true
			},
			{ name: 'get_meal_timing', tool: 'get_meal_timing', args: () => RANGE, emptyLike: true },
			{
				name: 'get_sleep_food_correlation',
				tool: 'get_sleep_food_correlation',
				args: () => RANGE,
				emptyLike: true
			},
			{
				name: 'get_weight_food_series',
				tool: 'get_weight_food_series',
				args: () => RANGE,
				emptyLike: true
			},
			{
				name: 'get_extended_nutrients',
				tool: 'get_extended_nutrients',
				args: () => RANGE,
				emptyLike: true
			},
			{
				name: 'get_daily_nutrients',
				tool: 'get_daily_nutrients',
				args: () => RANGE,
				emptyLike: true
			},
			{
				name: 'get_nutrient_gaps',
				tool: 'get_nutrient_gaps',
				args: () => RANGE,
				emptyLike: true
			},
			{
				name: 'find_nutrient_sources',
				tool: 'find_nutrient_sources',
				args: () => ({ nutrients: ['iron'], deficits: { iron: 5 } }),
				emptyLike: true
			},
			{
				name: 'get_eating_patterns',
				tool: 'get_eating_patterns',
				args: () => RANGE,
				emptyLike: true
			},
			{
				name: 'get_meal_plan_context',
				tool: 'get_meal_plan_context',
				args: () => ({}),
				emptyLike: true
			}
		]
	}
];

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	db = getTestDB(dbUrl);
	uploadDir = await mkdtemp(join(tmpdir(), 'bissbilanz-isolation-mcp-'));
	process.env.UPLOAD_DIR = uploadDir;
	vi.doMock('$lib/server/db', () => ({
		...schema,
		getDB: () => db,
		withDbRetry: <T>(fn: () => Promise<T>) => fn(),
		isTransientDbError: () => false
	}));
});

afterAll(async () => {
	delete process.env.UPLOAD_DIR;
	await rm(uploadDir, { recursive: true, force: true });
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

beforeEach(async () => {
	await resetDatabase(db, uploadDir);
	w = await createWorld(db, uploadDir);
	for (const resource of resources) await resource.seed?.(w);
});

describe('every MCP tool that takes an id or reads user data is covered', () => {
	it('lists the tools exercised by the table', async () => {
		const { toolNames } = await import('$lib/server/mcp/tools');
		const covered = new Set(resources.flatMap((r) => r.probes.map((p) => p.tool)));
		const userScoped = toolNames.filter((name) => name !== 'search_openfoodfacts');
		const missing = userScoped.filter((name) => !covered.has(name));
		expect(missing).toEqual([]);
	});
});

describe.each(resources)('MCP user isolation: $name', (resource) => {
	it.each(resource.probes.map((probe) => [probe.name, probe] as const))(
		'%s',
		async (_name, probe) => {
			await probe.arrange?.(w);
			const args = probe.args(w);
			const aIds = await collectAIds(w);
			const before = await snapshot(w);

			const result = await callTool(w.B, probe.tool, args);
			if (!probe.emptyLike && (probe.outcome ?? 'rejected') === 'rejected') {
				expect(rejected(result), `attacker got ${describeResult(result)}`).toBe(true);
			}

			expect(stripEchoed(result.text, args), 'response mentions user A data').not.toContain('isoa');
			for (const id of aIds) {
				if (JSON.stringify(args).includes(id)) continue;
				expect(result.text, `response leaks id ${id}`).not.toContain(id);
			}

			await probe.check?.(result, w);

			expect(await snapshot(w), 'user A data changed').toEqual(before);
			expect(await foreignReferences(w), 'user B now references user A data').toEqual({});

			if (probe.emptyLike) {
				const baseline = await callTool(w.C, probe.tool, args);
				expect(result.isError).toBe(baseline.isError);
				expect(result.payload, 'attacker sees something an empty account does not').toEqual(
					baseline.payload
				);
			}

			if (probe.control !== null) {
				const control = await callTool(w.A, probe.tool, probe.control ? probe.control(w) : args);
				expect(control.isError, `owner got ${describeResult(control)}`).toBe(false);
				if (probe.emptyLike) {
					expect(control.payload, 'probe cannot tell an empty account from the owner').not.toEqual(
						result.payload
					);
				}
			}
		}
	);
});
