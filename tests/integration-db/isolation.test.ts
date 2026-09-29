import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from '$lib/server/schema';
import { recipes, supplements } from '$lib/server/schema';
import type { User } from '$lib/server/schema';
import { CLIENT_EDITED_AT_HEADER } from '$lib/sync/contract';
import { createMockEvent } from '../helpers/mock-request-event';
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
	TODAY,
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

const DB_NAME = 'test_isolation';
const EDITED_AT = new Date(Date.now() + 60_000).toISOString();

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type Call = {
	route: string;
	method: Method;
	params?: Record<string, string>;
	query?: Record<string, string>;
	body?: unknown;
	headers?: Record<string, string>;
};

type Outcome = { status: number; text: string; json: any };

type Probe = {
	name: string;
	attack: (w: World) => Call;
	expect: number[];
	arrange?: (w: World) => Promise<void>;
	control?: ((w: World) => Call) | null;
	controlExpect?: number[];
	emptyLike?: boolean;
	check?: (out: Outcome, w: World) => void | Promise<void>;
	then?: (w: World, out: Outcome) => { call: Call; expect: number[] };
};

type Resource = {
	name: string;
	seed?: (w: World) => Promise<void>;
	probes: Probe[];
};

const routeModules = import.meta.glob('../../src/routes/**/+server.ts');

let dbUrl: string;
let uploadDir: string;
let db: TestDB;

const foodPayload = (extra: Record<string, unknown> = {}) => ({
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

const idCall =
	(route: string, method: Method, id: (w: World) => string, extra: Partial<Call> = {}) =>
	(w: World): Call => ({ route, method, params: { id: id(w) }, ...extra });

const foodBatchActions = [
	{ action: 'delete', payload: { force: true } },
	{ action: 'favorite' },
	{ action: 'unfavorite' },
	{ action: 'set_labels', payload: { labels: ['isobhijack'] } },
	{ action: 'add_labels', payload: { labels: ['isobhijack'] } },
	{ action: 'remove_labels', payload: { labels: ['isoalabel'] } }
];

const resources: Resource[] = [
	{
		name: 'foods',
		seed: seeders.foods,
		probes: [
			{
				name: 'GET by id',
				attack: idCall('api/foods/[id]', 'GET', (w) => w.a.food),
				expect: [404]
			},
			{
				name: 'PATCH',
				attack: idCall('api/foods/[id]', 'PATCH', (w) => w.a.food, {
					body: { name: 'isoB-hijacked', isFavorite: false }
				}),
				expect: [404]
			},
			{
				name: 'PATCH with a client edit time',
				attack: idCall('api/foods/[id]', 'PATCH', (w) => w.a.food, {
					body: { name: 'isoB-hijacked' },
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [404, 409]
			},
			{
				name: 'PATCH barcode to take over identity',
				attack: idCall('api/foods/[id]', 'PATCH', (w) => w.a.foodLoose, {
					body: { barcode: '9780201379624' }
				}),
				expect: [404]
			},
			{
				name: 'DELETE unused food with force',
				attack: idCall('api/foods/[id]', 'DELETE', (w) => w.a.foodLoose, {
					query: { force: 'true' }
				}),
				expect: [204, 404]
			},
			{
				name: 'DELETE food used by entries and recipes leaks no usage counts',
				attack: idCall('api/foods/[id]', 'DELETE', (w) => w.a.food),
				expect: [204, 404],
				controlExpect: [409]
			},
			{
				name: 'DELETE food used by entries and recipes with force',
				attack: idCall('api/foods/[id]', 'DELETE', (w) => w.a.food, { query: { force: 'true' } }),
				expect: [204, 404],
				controlExpect: [204, 409]
			},
			{
				name: 'DELETE supplement backing food leaks no usage counts',
				attack: idCall('api/foods/[id]', 'DELETE', (w) => w.a.suppFood),
				expect: [204, 404],
				controlExpect: [409]
			},
			{
				name: 'GET usage',
				attack: idCall('api/foods/[id]/usage', 'GET', (w) => w.a.food),
				expect: [404]
			},
			{
				name: 'GET labels',
				attack: idCall('api/foods/[id]/labels', 'GET', (w) => w.a.food),
				expect: [200, 404],
				check: (out) => {
					if (out.status === 200) expect(out.json.labels).toEqual([]);
				},
				controlExpect: [200]
			},
			{
				name: 'PUT labels',
				attack: idCall('api/foods/[id]/labels', 'PUT', (w) => w.a.food, {
					body: { labels: ['isobhijack'] }
				}),
				expect: [404]
			},
			{
				name: 'PUT labels with machine source and extend mode',
				attack: idCall('api/foods/[id]/labels', 'PUT', (w) => w.a.food, {
					body: { labels: ['isobhijack'], source: 'llm', mode: 'extend' }
				}),
				expect: [404]
			},
			{
				name: 'list',
				attack: () => ({ route: 'api/foods', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'list with search query',
				attack: () => ({ route: 'api/foods', method: 'GET', query: { q: 'isoA' } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'list unlabeled',
				attack: () => ({ route: 'api/foods', method: 'GET', query: { unlabeled: 'true' } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'lookup by barcode',
				attack: () => ({ route: 'api/foods', method: 'GET', query: { barcode: EAN } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'create with a barcode another user holds neither conflicts nor leaks',
				attack: () => ({ route: 'api/foods', method: 'POST', body: foodPayload({ barcode: EAN }) }),
				expect: [201],
				controlExpect: [409]
			},
			{
				name: 'recent',
				attack: () => ({ route: 'api/foods/recent', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'brands',
				attack: () => ({ route: 'api/foods/brands', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'duplicates',
				attack: () => ({ route: 'api/foods/duplicates', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'label vocabulary',
				attack: () => ({ route: 'api/foods/labels', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'label vocabulary by kind',
				attack: () => ({ route: 'api/foods/labels', method: 'GET', query: { kind: 'food' } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'batch label write',
				attack: (w) => ({
					route: 'api/foods/labels',
					method: 'POST',
					body: { items: [{ foodId: w.a.food, labels: ['isobhijack'] }] }
				}),
				expect: [200],
				controlExpect: [200],
				check: (out) => expect(out.json.results.every((r: any) => r.ok === false)).toBe(true)
			},
			...foodBatchActions.map((spec): Probe => ({
				name: `batch ${spec.action}`,
				attack: (w) => ({
					route: 'api/foods/batch',
					method: 'POST',
					body: { ids: [w.a.food, w.a.foodLoose], ...spec }
				}),
				expect: [200],
				controlExpect: [200],
				check: (out) => {
					expect(out.json.succeeded).toBe(0);
					expect(out.json.failed).toBe(2);
				}
			})),
			{
				name: 'merge foreign foods',
				attack: (w) => ({
					route: 'api/foods/merge',
					method: 'POST',
					body: { keeperId: w.a.foodKeeper, sourceIds: [w.a.foodSource] }
				}),
				expect: [404],
				controlExpect: [200]
			},
			{
				name: 'merge foreign source into own keeper',
				arrange: (w) => arrangeBOwn(w, ['food']),
				attack: (w) => ({
					route: 'api/foods/merge',
					method: 'POST',
					body: { keeperId: w.b.food, sourceIds: [w.a.foodSource] }
				}),
				expect: [404],
				control: (w) => ({
					route: 'api/foods/merge',
					method: 'POST',
					body: { keeperId: w.a.foodKeeper, sourceIds: [w.a.foodSource] }
				}),
				controlExpect: [200]
			},
			{
				name: 'merge own source into foreign keeper',
				arrange: (w) => arrangeBOwn(w, ['food']),
				attack: (w) => ({
					route: 'api/foods/merge',
					method: 'POST',
					body: { keeperId: w.a.foodKeeper, sourceIds: [w.b.food] }
				}),
				expect: [404],
				control: (w) => ({
					route: 'api/foods/merge',
					method: 'POST',
					body: { keeperId: w.a.foodKeeper, sourceIds: [w.a.foodSource] }
				}),
				controlExpect: [200]
			},
			{
				name: 'package export by id',
				attack: (w) => ({
					route: 'api/foods/package/export',
					method: 'POST',
					body: { foodIds: [w.a.food], recipeIds: [w.a.recipe] }
				}),
				expect: [200, 400, 404],
				controlExpect: [200]
			},
			{
				name: 'package export of everything',
				attack: () => ({ route: 'api/foods/package/export', method: 'POST', body: { all: true } }),
				expect: [200, 400, 404],
				controlExpect: [200]
			},
			{
				name: 'package export by label and brand',
				attack: () => ({
					route: 'api/foods/package/export',
					method: 'POST',
					body: { labels: ['isoalabel'], brands: ['isoA-Brand'], includeRecipes: 'related' }
				}),
				expect: [200, 400, 404],
				controlExpect: [200]
			},
			{
				name: 'package summary',
				attack: () => ({ route: 'api/foods/package/summary', method: 'POST', body: { all: true } }),
				expect: [200],
				controlExpect: [200],
				check: (out) => expect(out.json.foods ?? 0).toBe(0)
			},
			{
				name: 'favorites',
				attack: () => ({ route: 'api/favorites', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'favorite foods',
				attack: () => ({ route: 'api/favorites', method: 'GET', query: { type: 'foods' } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'favorite recipes',
				attack: () => ({ route: 'api/favorites', method: 'GET', query: { type: 'recipes' } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'own food pointing at a foreign upload cannot delete the upload',
				attack: (w) => ({
					route: 'api/foods',
					method: 'POST',
					body: foodPayload({ imageUrl: `/uploads/${w.a.upload}` })
				}),
				expect: [201],
				control: null,
				then: (w, out) => ({
					call: idCall('api/foods/[id]', 'DELETE', () => out.json.food.id)(w),
					expect: [204]
				})
			},
			{
				name: 'own food swapping away a foreign upload cannot delete the upload',
				attack: (w) => ({
					route: 'api/foods',
					method: 'POST',
					body: foodPayload({ imageUrl: `/uploads/${w.a.upload}` })
				}),
				expect: [201],
				control: null,
				then: (w, out) => ({
					call: idCall('api/foods/[id]', 'PATCH', () => out.json.food.id, {
						body: { imageUrl: null }
					})(w),
					expect: [200]
				})
			}
		]
	},
	{
		name: 'uploads',
		probes: [
			{
				name: 'GET file',
				attack: (w) => ({
					route: 'uploads/[filename]',
					method: 'GET',
					params: { filename: w.a.upload }
				}),
				expect: [403],
				controlExpect: [200]
			}
		]
	},
	{
		name: 'recipes',
		seed: seeders.recipes,
		probes: [
			{
				name: 'GET by id',
				attack: idCall('api/recipes/[id]', 'GET', (w) => w.a.recipe),
				expect: [404]
			},
			{
				name: 'PATCH name',
				attack: idCall('api/recipes/[id]', 'PATCH', (w) => w.a.recipe, {
					body: { name: 'isoB-hijacked' }
				}),
				expect: [404]
			},
			{
				name: 'PATCH with a client edit time',
				attack: idCall('api/recipes/[id]', 'PATCH', (w) => w.a.recipe, {
					body: { name: 'isoB-hijacked' },
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [404, 409]
			},
			{
				name: 'PATCH ingredients and steps replace',
				arrange: (w) => arrangeBOwn(w, ['food']),
				attack: (w) => ({
					route: 'api/recipes/[id]',
					method: 'PATCH',
					params: { id: w.a.recipe },
					body: {
						ingredients: [{ foodId: w.b.food, quantity: 1, servingUnit: 'g' }],
						steps: [{ text: 'isoB-step' }]
					}
				}),
				expect: [404],
				control: (w) => ({
					route: 'api/recipes/[id]',
					method: 'PATCH',
					params: { id: w.a.recipe },
					body: {
						ingredients: [{ foodId: w.a.foodLoose, quantity: 1, servingUnit: 'g' }],
						steps: [{ text: 'isoA-step-2' }]
					}
				}),
				controlExpect: [200]
			},
			{
				name: 'PATCH own recipe with a foreign ingredient',
				arrange: (w) => arrangeBOwn(w, ['recipe']),
				attack: (w) => ({
					route: 'api/recipes/[id]',
					method: 'PATCH',
					params: { id: w.b.recipe },
					body: { ingredients: [{ foodId: w.a.food, quantity: 1, servingUnit: 'g' }] }
				}),
				expect: [404],
				control: (w) => ({
					route: 'api/recipes/[id]',
					method: 'PATCH',
					params: { id: w.a.recipe },
					body: { ingredients: [{ foodId: w.a.foodLoose, quantity: 1, servingUnit: 'g' }] }
				}),
				controlExpect: [200]
			},
			{
				name: 'DELETE',
				attack: idCall('api/recipes/[id]', 'DELETE', (w) => w.a.recipe),
				expect: [204, 404],
				controlExpect: [409]
			},
			{
				name: 'DELETE with force',
				attack: idCall('api/recipes/[id]', 'DELETE', (w) => w.a.recipe, {
					query: { force: 'true' }
				}),
				expect: [204, 404],
				controlExpect: [204]
			},
			{
				name: 'GET usage',
				attack: idCall('api/recipes/[id]/usage', 'GET', (w) => w.a.recipe),
				expect: [404]
			},
			{
				name: 'list',
				attack: () => ({ route: 'api/recipes', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'create with a foreign ingredient',
				attack: (w) => ({
					route: 'api/recipes',
					method: 'POST',
					body: {
						name: 'isoB-stolen',
						totalServings: 1,
						ingredients: [{ foodId: w.a.food, quantity: 1, servingUnit: 'g' }]
					}
				}),
				expect: [404],
				controlExpect: [201]
			},
			{
				name: 'create alongside one foreign ingredient in a mixed list',
				arrange: (w) => arrangeBOwn(w, ['food']),
				attack: (w) => ({
					route: 'api/recipes',
					method: 'POST',
					body: {
						name: 'isoB-mixed',
						totalServings: 1,
						ingredients: [
							{ foodId: w.b.food, quantity: 1, servingUnit: 'g' },
							{ foodId: w.a.food, quantity: 1, servingUnit: 'g' }
						]
					}
				}),
				expect: [404],
				control: (w) => ({
					route: 'api/recipes',
					method: 'POST',
					body: {
						name: 'isoA-mixed',
						totalServings: 1,
						ingredients: [{ foodId: w.a.foodLoose, quantity: 1, servingUnit: 'g' }]
					}
				}),
				controlExpect: [201],
				check: async (_out, w) => {
					const rows = await w.db.select().from(recipes).where(eq(recipes.userId, w.B));
					expect(rows).toHaveLength(0);
				}
			}
		]
	},
	{
		name: 'entries',
		seed: seeders.entries,
		probes: [
			{
				name: 'list by date',
				attack: () => ({ route: 'api/entries', method: 'GET', query: { date: D1 } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'list by range',
				attack: () => ({
					route: 'api/entries/range',
					method: 'GET',
					query: { startDate: '2026-03-01', endDate: '2026-03-31' }
				}),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'PATCH',
				attack: idCall('api/entries/[id]', 'PATCH', (w) => w.a.entry, {
					body: { servings: 99, notes: 'isoB-hijacked' }
				}),
				expect: [404]
			},
			{
				name: 'PATCH quick entry',
				attack: idCall('api/entries/[id]', 'PATCH', (w) => w.a.quickEntry, {
					body: { quickCalories: 1 }
				}),
				expect: [404]
			},
			{
				name: 'PATCH with a client edit time',
				attack: idCall('api/entries/[id]', 'PATCH', (w) => w.a.entry, {
					body: { servings: 99 },
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [404, 409]
			},
			{
				name: 'PATCH own entry to a foreign food',
				arrange: (w) => arrangeBOwn(w, ['entry']),
				attack: (w) => ({
					route: 'api/entries/[id]',
					method: 'PATCH',
					params: { id: w.b.entry },
					body: { foodId: w.a.food }
				}),
				expect: [404],
				control: (w) => ({
					route: 'api/entries/[id]',
					method: 'PATCH',
					params: { id: w.a.entry },
					body: { foodId: w.a.foodLoose }
				}),
				controlExpect: [200]
			},
			{
				name: 'PATCH own entry to a foreign recipe',
				arrange: (w) => arrangeBOwn(w, ['entry']),
				attack: (w) => ({
					route: 'api/entries/[id]',
					method: 'PATCH',
					params: { id: w.b.entry },
					body: { recipeId: w.a.recipe }
				}),
				expect: [404],
				control: (w) => ({
					route: 'api/entries/[id]',
					method: 'PATCH',
					params: { id: w.a.entry },
					body: { recipeId: w.a.recipe }
				}),
				controlExpect: [200]
			},
			{
				name: 'PATCH own entry to another user’s custom meal type',
				arrange: (w) => arrangeBOwn(w, ['entry']),
				attack: (w) => ({
					route: 'api/entries/[id]',
					method: 'PATCH',
					params: { id: w.b.entry },
					body: { mealType: 'isoA-Meal' }
				}),
				expect: [400],
				control: (w) => ({
					route: 'api/entries/[id]',
					method: 'PATCH',
					params: { id: w.a.entry },
					body: { mealType: 'isoA-Meal' }
				}),
				controlExpect: [200]
			},
			{
				name: 'DELETE',
				attack: idCall('api/entries/[id]', 'DELETE', (w) => w.a.entry),
				expect: [204, 404]
			},
			{
				name: 'DELETE with a client edit time',
				attack: idCall('api/entries/[id]', 'DELETE', (w) => w.a.entry, {
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [204, 404, 409]
			},
			{
				name: 'DELETE supplement log entry',
				attack: idCall('api/entries/[id]', 'DELETE', (w) => w.a.todayEntry),
				expect: [204, 404]
			},
			{
				name: 'create for a foreign food',
				attack: (w) => ({
					route: 'api/entries',
					method: 'POST',
					body: { foodId: w.a.food, mealType: 'Lunch', servings: 1, date: D1 }
				}),
				expect: [404],
				control: (w) => ({
					route: 'api/entries',
					method: 'POST',
					body: { foodId: w.a.food, mealType: 'Lunch', servings: 1, date: D1 }
				}),
				controlExpect: [201]
			},
			{
				name: 'create for a foreign recipe',
				attack: (w) => ({
					route: 'api/entries',
					method: 'POST',
					body: { recipeId: w.a.recipe, mealType: 'Lunch', servings: 1, date: D1 }
				}),
				expect: [404],
				controlExpect: [201]
			},
			{
				name: 'create with another user’s custom meal type',
				arrange: (w) => arrangeBOwn(w, ['food']),
				attack: (w) => ({
					route: 'api/entries',
					method: 'POST',
					body: { foodId: w.b.food, mealType: 'isoA-Meal', servings: 1, date: D1 }
				}),
				expect: [400],
				control: (w) => ({
					route: 'api/entries',
					method: 'POST',
					body: { foodId: w.a.food, mealType: 'isoA-Meal', servings: 1, date: D1 }
				}),
				controlExpect: [201]
			},
			{
				name: 'copy day',
				attack: () => ({
					route: 'api/entries/copy',
					method: 'POST',
					query: { fromDate: D1, toDate: D2 }
				}),
				expect: [200],
				check: (out) => expect(out.json.count).toBe(0),
				controlExpect: [200]
			}
		]
	},
	{
		name: 'weight',
		seed: seeders.weight,
		probes: [
			{
				name: 'list',
				attack: () => ({ route: 'api/weight', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'list with trend',
				attack: () => ({
					route: 'api/weight',
					method: 'GET',
					query: { from: '2026-03-01', to: '2026-03-31' }
				}),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'latest',
				attack: () => ({ route: 'api/weight/latest', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'PATCH',
				attack: idCall('api/weight/[id]', 'PATCH', (w) => w.a.weight, { body: { weightKg: 50 } }),
				expect: [404]
			},
			{
				name: 'PATCH with a client edit time',
				attack: idCall('api/weight/[id]', 'PATCH', (w) => w.a.weight, {
					body: { weightKg: 50 },
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [404, 409]
			},
			{
				name: 'DELETE',
				attack: idCall('api/weight/[id]', 'DELETE', (w) => w.a.weight),
				expect: [404]
			},
			{
				name: 'create on a date another user already logged',
				attack: () => ({
					route: 'api/weight',
					method: 'POST',
					body: { weightKg: 70, entryDate: D1 }
				}),
				expect: [201]
			}
		]
	},
	{
		name: 'sleep',
		seed: seeders.sleep,
		probes: [
			{
				name: 'list',
				attack: () => ({ route: 'api/sleep', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'list by range',
				attack: () => ({
					route: 'api/sleep',
					method: 'GET',
					query: { from: '2026-03-01', to: '2026-03-31' }
				}),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'PATCH',
				attack: idCall('api/sleep/[id]', 'PATCH', (w) => w.a.sleep, { body: { quality: 1 } }),
				expect: [404]
			},
			{
				name: 'PATCH with a client edit time',
				attack: idCall('api/sleep/[id]', 'PATCH', (w) => w.a.sleep, {
					body: { quality: 1 },
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [404, 409]
			},
			{
				name: 'DELETE',
				attack: idCall('api/sleep/[id]', 'DELETE', (w) => w.a.sleep),
				expect: [404]
			},
			{
				name: 'create on a date another user already logged',
				attack: () => ({
					route: 'api/sleep',
					method: 'POST',
					body: { durationMinutes: 400, quality: 5, entryDate: D1 }
				}),
				expect: [201],
				controlExpect: [409]
			}
		]
	},
	{
		name: 'supplements',
		seed: seeders.supplements,
		probes: [
			{
				name: 'list',
				attack: () => ({ route: 'api/supplements', method: 'GET', query: { all: 'true' } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'today checklist',
				attack: () => ({ route: 'api/supplements/today', method: 'GET' }),
				expect: [200],
				check: (out) => expect(out.json.checklist).toEqual([]),
				controlExpect: [200]
			},
			{
				name: 'checklist for a date',
				attack: () => ({
					route: 'api/supplements/[date]/checklist',
					method: 'GET',
					params: { date: D1 }
				}),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'history',
				attack: () => ({
					route: 'api/supplements/history',
					method: 'GET',
					query: { from: '2026-01-01', to: '2026-12-31' }
				}),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'GET by id',
				attack: idCall('api/supplements/[id]', 'GET', (w) => w.a.supp),
				expect: [404]
			},
			{
				name: 'PATCH',
				attack: idCall('api/supplements/[id]', 'PATCH', (w) => w.a.supp, {
					body: { name: 'isoB-hijacked', isActive: false }
				}),
				expect: [404]
			},
			{
				name: 'PATCH with a client edit time',
				attack: idCall('api/supplements/[id]', 'PATCH', (w) => w.a.supp, {
					body: { name: 'isoB-hijacked' },
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [404, 409]
			},
			{
				name: 'PATCH replacing ingredients',
				arrange: (w) => arrangeBOwn(w, ['food']),
				attack: (w) => ({
					route: 'api/supplements/[id]',
					method: 'PATCH',
					params: { id: w.a.supp },
					body: { ingredients: [{ foodId: w.b.food, servings: 1 }] }
				}),
				expect: [404],
				control: (w) => ({
					route: 'api/supplements/[id]',
					method: 'PATCH',
					params: { id: w.a.supp },
					body: { ingredients: [{ foodId: w.a.foodLoose, servings: 1 }] }
				}),
				controlExpect: [200]
			},
			{
				name: 'PATCH own supplement with a foreign ingredient food',
				arrange: (w) => arrangeBOwn(w, ['supp']),
				attack: (w) => ({
					route: 'api/supplements/[id]',
					method: 'PATCH',
					params: { id: w.b.supp },
					body: { ingredients: [{ foodId: w.a.food, servings: 1 }] }
				}),
				expect: [400, 404],
				control: (w) => ({
					route: 'api/supplements/[id]',
					method: 'PATCH',
					params: { id: w.a.supp },
					body: { ingredients: [{ foodId: w.a.foodLoose, servings: 1 }] }
				}),
				controlExpect: [200]
			},
			{
				name: 'create with a foreign ingredient food',
				attack: (w) => ({
					route: 'api/supplements',
					method: 'POST',
					body: {
						name: 'isoB-stolen',
						scheduleType: 'daily',
						ingredients: [{ foodId: w.a.suppFood, servings: 1 }]
					}
				}),
				expect: [400, 404],
				control: (w) => ({
					route: 'api/supplements',
					method: 'POST',
					body: {
						name: 'isoA-second',
						scheduleType: 'daily',
						ingredients: [{ foodId: w.a.suppFood, servings: 1 }]
					}
				}),
				controlExpect: [201],
				check: async (_out, w) => {
					const rows = await w.db.select().from(supplements).where(eq(supplements.userId, w.B));
					expect(rows).toHaveLength(0);
				}
			},
			{
				name: 'DELETE',
				attack: idCall('api/supplements/[id]', 'DELETE', (w) => w.a.supp),
				expect: [204, 404]
			},
			{
				name: 'DELETE with a client edit time',
				attack: idCall('api/supplements/[id]', 'DELETE', (w) => w.a.supp, {
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [204, 404, 409]
			},
			{
				name: 'log',
				attack: idCall('api/supplements/[id]/log', 'POST', (w) => w.a.supp, {
					body: { date: D2 }
				}),
				expect: [404]
			},
			{
				name: 'unlog',
				attack: (w) => ({
					route: 'api/supplements/[id]/log/[date]',
					method: 'DELETE',
					params: { id: w.a.supp, date: D1 }
				}),
				expect: [204, 404]
			}
		]
	},
	{
		name: 'ai tasks',
		seed: seeders.aiTasks,
		probes: [
			{
				name: 'list',
				attack: () => ({ route: 'api/ai-tasks', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'list pending',
				attack: () => ({ route: 'api/ai-tasks', method: 'GET', query: { status: 'pending' } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'PATCH complete',
				attack: idCall('api/ai-tasks/[id]', 'PATCH', (w) => w.a.task, {
					body: { status: 'completed', resultSummary: 'isoB-hijacked' }
				}),
				expect: [404]
			},
			{
				name: 'PATCH dismiss',
				attack: idCall('api/ai-tasks/[id]', 'PATCH', (w) => w.a.task, {
					body: { status: 'dismissed', processedBy: 'on_device' }
				}),
				expect: [404]
			},
			{
				name: 'PATCH with a client edit time',
				attack: idCall('api/ai-tasks/[id]', 'PATCH', (w) => w.a.task, {
					body: { description: 'isoB-hijacked' },
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [404, 409]
			},
			{
				name: 'DELETE',
				attack: idCall('api/ai-tasks/[id]', 'DELETE', (w) => w.a.task),
				expect: [204, 404]
			},
			{
				name: 'acknowledge by id',
				attack: (w) => ({
					route: 'api/ai-tasks/acknowledge',
					method: 'POST',
					body: { ids: [w.a.task] }
				}),
				expect: [200],
				check: (out) => expect(out.json.acknowledged).toBe(0),
				controlExpect: [200]
			},
			{
				name: 'acknowledge all',
				attack: () => ({ route: 'api/ai-tasks/acknowledge', method: 'POST', body: {} }),
				expect: [200],
				check: (out) => expect(out.json.acknowledged).toBe(0),
				controlExpect: [200]
			},
			{
				name: 'create referencing a foreign photo cannot delete it',
				attack: (w) => ({
					route: 'api/ai-tasks',
					method: 'POST',
					body: { photoUrls: [`/uploads/${w.a.upload}`], date: D1 }
				}),
				expect: [201],
				control: null,
				then: (w, out) => ({
					call: idCall('api/ai-tasks/[id]', 'DELETE', () => out.json.task.id)(w),
					expect: [204]
				})
			}
		]
	},
	{
		name: 'reminders',
		seed: seeders.reminders,
		probes: [
			{
				name: 'list',
				attack: () => ({ route: 'api/reminders', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'GET by id',
				attack: idCall('api/reminders/[id]', 'GET', (w) => w.a.reminder),
				expect: [404]
			},
			{
				name: 'PATCH',
				attack: idCall('api/reminders/[id]', 'PATCH', (w) => w.a.reminder, {
					body: { enabled: false, time: '03:00' }
				}),
				expect: [404]
			},
			{
				name: 'PATCH with a client edit time',
				attack: idCall('api/reminders/[id]', 'PATCH', (w) => w.a.reminder, {
					body: { enabled: false },
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [404, 409]
			},
			{
				name: 'DELETE',
				attack: idCall('api/reminders/[id]', 'DELETE', (w) => w.a.reminder),
				expect: [204, 404]
			}
		]
	},
	{
		name: 'meal types',
		seed: seeders.mealTypes,
		probes: [
			{
				name: 'list',
				attack: () => ({ route: 'api/meal-types', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'PATCH',
				attack: idCall('api/meal-types/[id]', 'PATCH', (w) => w.a.mealType, {
					body: { name: 'isoB-hijacked' }
				}),
				expect: [404]
			},
			{
				name: 'DELETE',
				attack: idCall('api/meal-types/[id]', 'DELETE', (w) => w.a.mealType),
				expect: [204, 404],
				controlExpect: [204, 409]
			}
		]
	},
	{
		name: 'fasts',
		seed: seeders.fasts,
		probes: [
			{
				name: 'list',
				attack: () => ({ route: 'api/fasts', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'PATCH',
				attack: idCall('api/fasts/[id]', 'PATCH', (w) => w.a.fast, { body: { targetHours: 1 } }),
				expect: [404]
			},
			{
				name: 'PATCH with a client edit time',
				attack: idCall('api/fasts/[id]', 'PATCH', (w) => w.a.fast, {
					body: { targetHours: 1 },
					headers: { [CLIENT_EDITED_AT_HEADER]: EDITED_AT }
				}),
				expect: [404, 409]
			},
			{
				name: 'DELETE',
				attack: idCall('api/fasts/[id]', 'DELETE', (w) => w.a.fast),
				expect: [404]
			},
			{
				name: 'upsert onto an id another user owns',
				attack: (w) => ({
					route: 'api/fasts',
					method: 'POST',
					body: {
						id: w.a.fast,
						startedAt: '2026-04-01T08:00:00Z',
						endedAt: '2026-04-01T20:00:00Z',
						targetHours: 12
					}
				}),
				expect: [404, 409],
				controlExpect: [201]
			}
		]
	},
	{
		name: 'day properties',
		seed: seeders.dayProperties,
		probes: [
			{
				name: 'GET by query date',
				attack: () => ({ route: 'api/day-properties', method: 'GET', query: { date: D1 } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'GET range',
				attack: () => ({
					route: 'api/day-properties',
					method: 'GET',
					query: { startDate: '2026-03-01', endDate: '2026-03-31' }
				}),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'GET by path date',
				attack: () => ({
					route: 'api/day-properties/[date]',
					method: 'GET',
					params: { date: D1 }
				}),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'PUT writes only the caller’s own day',
				attack: () => ({
					route: 'api/day-properties',
					method: 'PUT',
					body: { date: D1, notes: 'isoB-note', isFastingDay: false, waterMl: 1 }
				}),
				expect: [200],
				check: (out) => expect(out.json.properties.notes).toBe('isoB-note')
			},
			{
				name: 'PUT by path date',
				attack: () => ({
					route: 'api/day-properties/[date]',
					method: 'PUT',
					params: { date: D1 },
					body: { notes: 'isoB-note' }
				}),
				expect: [200],
				check: (out) => expect(out.json.properties.waterMl ?? null).toBeNull()
			},
			{
				name: 'DELETE by query date',
				attack: () => ({ route: 'api/day-properties', method: 'DELETE', query: { date: D1 } }),
				expect: [204]
			},
			{
				name: 'DELETE by path date',
				attack: () => ({
					route: 'api/day-properties/[date]',
					method: 'DELETE',
					params: { date: D1 }
				}),
				expect: [204]
			}
		]
	},
	{
		name: 'goals',
		seed: seeders.goals,
		probes: [
			{
				name: 'GET',
				attack: () => ({ route: 'api/goals', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'POST writes only the caller’s own goals',
				attack: () => ({
					route: 'api/goals',
					method: 'POST',
					body: { calorieGoal: 1, proteinGoal: 1, carbGoal: 1, fatGoal: 1, fiberGoal: 1 }
				}),
				expect: [200],
				controlExpect: [200],
				check: (out, w) => expect(out.json.goals.userId).toBe(w.B)
			}
		]
	},
	{
		name: 'preferences',
		seed: seeders.preferences,
		probes: [
			{
				name: 'GET',
				attack: () => ({ route: 'api/preferences', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'PATCH writes only the caller’s own preferences',
				attack: () => ({
					route: 'api/preferences',
					method: 'PATCH',
					body: { showChartWidget: true, showWeightWidget: false }
				}),
				expect: [200]
			},
			{
				name: 'PATCH favorite timeframes with another user’s custom meal type',
				attack: (w) => ({
					route: 'api/preferences',
					method: 'PATCH',
					body: {
						favoriteMealTimeframes: [
							{
								mealType: 'isoA-Meal',
								customMealTypeId: w.a.mealType,
								startTime: '06:00',
								endTime: '09:00'
							}
						]
					}
				}),
				expect: [400],
				controlExpect: [200]
			}
		]
	},
	{
		name: 'push subscriptions',
		seed: seeders.pushSubscriptions,
		probes: [
			{
				name: 'DELETE by endpoint',
				attack: (w) => ({
					route: 'api/push/subscriptions',
					method: 'DELETE',
					body: { endpoint: w.a.pushEndpoint }
				}),
				expect: [200],
				controlExpect: [200]
			}
		]
	},
	{
		name: 'identities',
		seed: seeders.identities,
		probes: [
			{
				name: 'list',
				attack: () => ({ route: 'api/auth/identities', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'DELETE',
				attack: idCall('api/auth/identities/[id]', 'DELETE', (w) => w.a.identity),
				expect: [200, 404, 409],
				controlExpect: [200]
			}
		]
	},
	{
		name: 'catalog',
		seed: seeders.catalog,
		probes: [
			{
				name: 'search',
				attack: () => ({ route: 'api/catalog/search', method: 'GET', query: { q: 'isoA' } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'barcode',
				attack: () => ({
					route: 'api/catalog/barcode/[code]',
					method: 'GET',
					params: { code: '7610095131003' }
				}),
				expect: [404],
				controlExpect: [200]
			},
			{
				name: 'save into the caller’s foods',
				attack: idCall('api/catalog/[id]/save', 'POST', (w) => w.a.catalogFood),
				expect: [404],
				controlExpect: [201]
			}
		]
	},
	{
		name: 'stats and analytics',
		probes: [
			{
				name: 'stats daily',
				attack: () => ({
					route: 'api/stats/daily',
					method: 'GET',
					query: { startDate: '2026-03-01', endDate: '2026-03-31' }
				}),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'stats weekly',
				attack: () => ({ route: 'api/stats/weekly', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'stats monthly',
				attack: () => ({ route: 'api/stats/monthly', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'stats calendar',
				attack: () => ({ route: 'api/stats/calendar', method: 'GET', query: { month: '2026-03' } }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'stats meal breakdown',
				attack: () => ({
					route: 'api/stats/meal-breakdown',
					method: 'GET',
					query: { startDate: '2026-03-01', endDate: '2026-03-31' }
				}),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'stats streaks',
				attack: () => ({ route: 'api/stats/streaks', method: 'GET' }),
				expect: [200],
				emptyLike: true
			},
			{
				name: 'stats top foods',
				attack: () => ({
					route: 'api/stats/top-foods',
					method: 'GET',
					query: { days: '400', limit: '10' }
				}),
				expect: [200],
				emptyLike: true
			},
			...[
				'food-diversity',
				'meal-timing',
				'nutrient-gaps',
				'nutrients-daily',
				'nutrients-extended',
				'sleep-food',
				'weight-food'
			].map((name): Probe => ({
				name: `analytics ${name}`,
				attack: () => ({
					route: `api/analytics/${name}`,
					method: 'GET',
					query: { startDate: '2026-03-01', endDate: '2026-03-31' }
				}),
				expect: [200],
				controlExpect: [200],
				emptyLike: name !== 'nutrient-gaps'
			})),
			{
				name: 'maintenance',
				attack: () => ({
					route: 'api/maintenance',
					method: 'GET',
					query: { startDate: '2026-03-01', endDate: '2026-03-31' }
				}),
				expect: [200, 400],
				emptyLike: true
			}
		]
	},
	{
		name: 'account export',
		probes: [
			{
				name: 'export contains only the caller’s data',
				attack: () => ({ route: 'api/account/export', method: 'GET' }),
				expect: [200],
				controlExpect: [200]
			}
		]
	}
];

const execute = async (userId: string, call: Call): Promise<Outcome> => {
	const key = `../../src/routes/${call.route}/+server.ts`;
	const load = routeModules[key];
	if (!load) throw new Error(`No route module for ${call.route}`);
	const mod = (await load()) as Record<string, (event: unknown) => Promise<Response>>;
	const handler = mod[call.method];
	if (!handler) throw new Error(`${call.route} has no ${call.method} handler`);

	let path = `/${call.route}`;
	for (const [name, value] of Object.entries(call.params ?? {})) {
		path = path.replace(`[${name}]`, value);
	}
	const event = createMockEvent({
		user: { id: userId } as User,
		method: call.method,
		url: `http://localhost:5173${path}`,
		params: call.params,
		searchParams: call.query,
		headers: call.headers,
		body: call.body as Record<string, unknown> | undefined
	});
	let response: Response;
	try {
		response = await handler(event);
	} catch (thrown) {
		const status = (thrown as { status?: unknown }).status;
		if (typeof status !== 'number') throw thrown;
		const body = JSON.stringify((thrown as { body?: unknown }).body ?? {});
		return { status, text: body, json: JSON.parse(body) };
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	let text = new TextDecoder().decode(bytes);
	if ((response.headers.get('content-type') ?? '').includes('zip')) {
		text = Object.entries(unzipSync(bytes))
			.map(([name, data]) => `${name}\n${strFromU8(data)}`)
			.join('\n');
	}
	let json: any = null;
	try {
		json = JSON.parse(text);
	} catch {
		json = null;
	}
	return { status: response.status, text, json };
};

const defaultControlStatus: Record<Method, number[]> = {
	GET: [200],
	POST: [201],
	PUT: [200],
	PATCH: [200],
	DELETE: [204]
};

const describeOutcome = (out: Outcome) => `status ${out.status}: ${out.text.slice(0, 300)}`;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	db = getTestDB(dbUrl);
	uploadDir = await mkdtemp(join(tmpdir(), 'bissbilanz-isolation-'));
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

let w: World;

beforeEach(async () => {
	await resetDatabase(db, uploadDir);
	w = await createWorld(db, uploadDir);
	for (const resource of resources) await resource.seed?.(w);
});

describe.each(resources)('user isolation: $name', (resource) => {
	it.each(resource.probes.map((probe) => [probe.name, probe] as const))(
		'%s',
		async (_name, probe) => {
			await probe.arrange?.(w);
			const attack = probe.attack(w);
			const aIds = await collectAIds(w);
			const before = await snapshot(w);

			const out = await execute(w.B, attack);
			expect(probe.expect, `attacker got ${describeOutcome(out)}`).toContain(out.status);

			expect(stripEchoed(out.text, attack), 'response mentions user A data').not.toContain('isoa');
			for (const id of aIds) {
				if (JSON.stringify(attack).includes(id)) continue;
				expect(out.text, `response leaks id ${id}`).not.toContain(id);
			}

			await probe.check?.(out, w);

			if (probe.then) {
				const step = probe.then(w, out);
				const followUp = await execute(w.B, step.call);
				expect(step.expect, `follow-up got ${describeOutcome(followUp)}`).toContain(
					followUp.status
				);
			}

			expect(await snapshot(w), 'user A data changed').toEqual(before);
			expect(await foreignReferences(w), 'user B now references user A data').toEqual({});

			if (probe.emptyLike) {
				const baseline = await execute(w.C, attack);
				expect(out.status).toBe(baseline.status);
				expect(out.json, 'attacker sees something an empty account does not').toEqual(
					baseline.json
				);
			}

			if (probe.control !== null) {
				const control = await execute(w.A, probe.control ? probe.control(w) : attack);
				const allowed = probe.controlExpect ?? defaultControlStatus[attack.method];
				expect(allowed, `owner got ${describeOutcome(control)}`).toContain(control.status);
				if (probe.emptyLike) {
					expect(control.json, 'probe cannot tell an empty account from the owner').not.toEqual(
						out.json
					);
				}
			}
		}
	);
});
