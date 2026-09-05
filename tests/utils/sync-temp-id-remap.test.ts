/**
 * Offline creates are queued under a client-generated id. When the drain sends
 * the create and the server answers with its own id, every later queued write
 * (and the optimistic Dexie row) must be moved to the server id — otherwise the
 * follow-up PATCH/DELETE 404s and the local row is wiped on the next refresh.
 */
import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$lib/stores/sync-state.svelte', () => ({
	setSyncing: vi.fn(),
	setPendingCount: vi.fn(),
	setFailedCount: vi.fn(),
	setLastSyncedAt: vi.fn(),
	addSyncError: vi.fn(),
	clearSyncErrors: vi.fn(),
	addSyncConflict: vi.fn()
}));
vi.mock('$lib/paraglide/messages', () => ({
	sync_conflict_superseded: () => 'superseded',
	sync_conflict_deleted: () => 'deleted'
}));
vi.mock('$lib/services/food-service.svelte', () => ({ foodService: { refresh: vi.fn() } }));
vi.mock('$lib/services/recipe-service.svelte', () => ({ recipeService: { refresh: vi.fn() } }));
vi.mock('$lib/services/goals-service.svelte', () => ({ goalsService: { refresh: vi.fn() } }));
vi.mock('$lib/services/preferences-service.svelte', () => ({
	preferencesService: { refresh: vi.fn() }
}));
vi.mock('$lib/services/supplement-service.svelte', () => ({
	supplementService: { refresh: vi.fn() }
}));
vi.mock('$lib/services/weight-service.svelte', () => ({ weightService: { refresh: vi.fn() } }));
vi.mock('$lib/services/meal-type-service.svelte', () => ({
	mealTypeService: { refresh: vi.fn() }
}));
vi.mock('$lib/services/favorites-service.svelte', () => ({
	favoritesService: { refresh: vi.fn() }
}));

const { db } = await import('$lib/db');
const { enqueue } = await import('$lib/stores/offline-queue');
const { syncQueue } = await import('$lib/stores/sync');
const { extractCreatedId, remapLocalId } = await import('$lib/sync/temp-ids');

const TEMP_FOOD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVER_FOOD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEMP_ENTRY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SERVER_ENTRY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];

function fetchMock(handler: (call: Call) => Response) {
	return vi.fn(async (url: string, init: RequestInit) => {
		const call = {
			url,
			method: init.method ?? 'GET',
			body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined
		};
		calls.push(call);
		return handler(call);
	});
}

describe('temp-id adoption during drain', () => {
	beforeEach(async () => {
		calls.length = 0;
		await Promise.all(db.tables.map((t) => t.clear()));
		vi.stubGlobal('navigator', { onLine: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test('offline create → edit → entry referencing it all land on the server id', async () => {
		await db.foods.put({ id: TEMP_FOOD, name: 'Temp' } as never);
		await db.foodEntries.put({ id: TEMP_ENTRY, foodId: TEMP_FOOD, amount: 1 } as never);
		await enqueue(
			'POST',
			'/api/foods',
			{ name: 'Temp' },
			{ affectedTable: 'foods', affectedId: TEMP_FOOD }
		);
		await enqueue(
			'PATCH',
			`/api/foods/${TEMP_FOOD}`,
			{ name: 'Renamed' },
			{ affectedTable: 'foods', affectedId: TEMP_FOOD }
		);
		await enqueue(
			'POST',
			'/api/entries',
			{ foodId: TEMP_FOOD, amount: 1 },
			{ affectedTable: 'foodEntries', affectedId: TEMP_ENTRY }
		);
		await enqueue(
			'DELETE',
			`/api/entries/${TEMP_ENTRY}`,
			{},
			{ affectedTable: 'foodEntries', affectedId: TEMP_ENTRY }
		);

		vi.stubGlobal(
			'fetch',
			fetchMock((call) => {
				if (call.method === 'POST' && call.url === '/api/foods') {
					return jsonResponse(201, { food: { id: SERVER_FOOD, name: 'Temp' } });
				}
				if (call.method === 'POST' && call.url === '/api/entries') {
					return jsonResponse(201, {
						entry: { id: SERVER_ENTRY, foodId: (call.body as { foodId: string }).foodId }
					});
				}
				return jsonResponse(200, { ok: true });
			})
		);

		const synced = await syncQueue();

		expect(synced).toBe(4);
		expect(calls.map((c) => [c.method, c.url])).toEqual([
			['POST', '/api/foods'],
			['PATCH', `/api/foods/${SERVER_FOOD}`],
			['POST', '/api/entries'],
			['DELETE', `/api/entries/${SERVER_ENTRY}`]
		]);
		expect(calls[2].body).toEqual({ foodId: SERVER_FOOD, amount: 1 });
		expect(await db.syncQueue.count()).toBe(0);

		expect(await db.foods.get(TEMP_FOOD)).toBeUndefined();
		expect(await db.foods.get(SERVER_FOOD)).toMatchObject({ name: 'Temp' });
		expect(await db.foodEntries.get(SERVER_ENTRY)).toMatchObject({ foodId: SERVER_FOOD });
	});

	test('a create whose response echoes the client id needs no remap', async () => {
		await enqueue(
			'POST',
			'/api/weight',
			{ weightKg: 80 },
			{ affectedTable: 'weightEntries', affectedId: TEMP_ENTRY }
		);
		await enqueue(
			'PATCH',
			`/api/weight/${TEMP_ENTRY}`,
			{ weightKg: 81 },
			{ affectedTable: 'weightEntries', affectedId: TEMP_ENTRY }
		);
		vi.stubGlobal(
			'fetch',
			fetchMock((call) =>
				call.method === 'POST'
					? jsonResponse(201, { entry: { id: TEMP_ENTRY } })
					: jsonResponse(200, { entry: { id: TEMP_ENTRY } })
			)
		);

		await syncQueue();

		expect(calls[1].url).toBe(`/api/weight/${TEMP_ENTRY}`);
		expect(await db.syncQueue.count()).toBe(0);
	});

	test('a create followed by a backed-off item is still remapped for the next pass', async () => {
		await enqueue(
			'POST',
			'/api/foods',
			{ name: 'A' },
			{ affectedTable: 'foods', affectedId: TEMP_FOOD }
		);
		await enqueue(
			'PATCH',
			`/api/foods/${TEMP_FOOD}`,
			{ name: 'B' },
			{ affectedTable: 'foods', affectedId: TEMP_FOOD }
		);
		vi.stubGlobal(
			'fetch',
			fetchMock((call) =>
				call.method === 'POST'
					? jsonResponse(201, { food: { id: SERVER_FOOD } })
					: jsonResponse(500, { error: 'boom' })
			)
		);

		await syncQueue();

		const [left] = await db.syncQueue.toArray();
		expect(left.url).toBe(`/api/foods/${SERVER_FOOD}`);
		expect(left.retryCount).toBe(1);
	});
});

describe('extractCreatedId', () => {
	test('reads the id of the enveloped row', () => {
		expect(extractCreatedId({ entry: { id: 'x', foodId: 'y' } })).toBe('x');
		expect(extractCreatedId({ mealType: { id: 'm' } })).toBe('m');
	});

	test('returns null for bodies without a created row', () => {
		expect(extractCreatedId({ ok: true })).toBeNull();
		expect(extractCreatedId(null)).toBeNull();
		expect(extractCreatedId('id')).toBeNull();
	});
});

describe('remapLocalId', () => {
	beforeEach(async () => {
		await Promise.all(db.tables.map((t) => t.clear()));
	});

	test('moves a recipe row and repoints entries and ingredients', async () => {
		await db.recipes.put({ id: TEMP_FOOD, name: 'R' } as never);
		await db.recipeIngredients.put({ id: 'i1', recipeId: TEMP_FOOD, foodId: 'f' } as never);
		await db.foodEntries.put({ id: 'e1', recipeId: TEMP_FOOD, foodId: null } as never);

		await remapLocalId('recipes', TEMP_FOOD, SERVER_FOOD);

		expect(await db.recipes.get(TEMP_FOOD)).toBeUndefined();
		expect(await db.recipes.get(SERVER_FOOD)).toMatchObject({ name: 'R' });
		expect(await db.recipeIngredients.get('i1')).toMatchObject({ recipeId: SERVER_FOOD });
		expect(await db.foodEntries.get('e1')).toMatchObject({ recipeId: SERVER_FOOD });
	});

	test('re-keys supplement logs under the server supplement id', async () => {
		await db.supplements.put({ id: TEMP_FOOD, name: 'S' } as never);
		await db.supplementLogs.put({ supplementId: TEMP_FOOD, date: '2026-09-05' } as never);

		await remapLocalId('supplements', TEMP_FOOD, SERVER_FOOD);

		expect(await db.supplementLogs.where('supplementId').equals(TEMP_FOOD).count()).toBe(0);
		expect(await db.supplementLogs.get([SERVER_FOOD, '2026-09-05'] as never)).toMatchObject({
			date: '2026-09-05'
		});
	});

	test('ignores tables it does not know', async () => {
		await expect(remapLocalId('userGoals', TEMP_FOOD, SERVER_FOOD)).resolves.toBeUndefined();
	});
});
