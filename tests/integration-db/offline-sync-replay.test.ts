/**
 * End-to-end replay of the web offline queue against a real Postgres.
 *
 * The real client code runs unmodified: `enqueue()` writes to a (fake) IndexedDB
 * and `syncQueue()` drains it, building each request with the same headers the
 * browser sends (Idempotency-Key, X-Client-Edited-At). Its `fetch` is stubbed to
 * hand the request to the real SvelteKit route handlers, wrapped in the same
 * `withIdempotency` layer that hooks.server.ts applies, with `locals.user` set
 * directly (no cookie/session auth involved).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, foods, foodEntries, idempotencyKeys } from '$lib/server/schema';

vi.mock('$app/environment', () => ({ browser: true, building: false, dev: true, version: 'test' }));

const syncState = vi.hoisted(() => ({
	setSyncing: vi.fn(),
	setPendingCount: vi.fn(),
	setFailedCount: vi.fn(),
	setLastSyncedAt: vi.fn(),
	addSyncError: vi.fn(),
	clearSyncErrors: vi.fn(),
	addSyncConflict: vi.fn(),
	setAuthRequired: vi.fn()
}));
vi.mock('$lib/stores/sync-state.svelte', () => syncState);
vi.mock('$lib/paraglide/messages', () => ({
	sync_conflict_superseded: () => 'superseded',
	sync_conflict_deleted: () => 'deleted',
	sync_error_item: ({ reason }: { reason: string }) => `error item: ${reason}`,
	sync_error_gave_up: () => 'gave up',
	sync_error_dependency: () => 'dependency'
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

const DB_NAME = 'test_offline_sync_replay';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', async () => ({
		...(await import('$lib/server/schema')),
		getDB: () => db
	}));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

type Handler = (event: RequestEvent) => Promise<Response>;
type Route = { method: string; pattern: RegExp; load: () => Promise<Record<string, unknown>> };

const routes: Route[] = [
	{
		method: '*',
		pattern: /^\/api\/foods$/,
		load: () => import('../../src/routes/api/foods/+server')
	},
	{
		method: '*',
		pattern: /^\/api\/foods\/([^/]+)$/,
		load: () => import('../../src/routes/api/foods/[id]/+server')
	},
	{
		method: '*',
		pattern: /^\/api\/entries$/,
		load: () => import('../../src/routes/api/entries/+server')
	},
	{
		method: '*',
		pattern: /^\/api\/entries\/([^/]+)$/,
		load: () => import('../../src/routes/api/entries/[id]/+server')
	}
];

let userId: string;
let otherUserId: string;
let calls: { method: string; path: string; key: string | null; status: number }[] = [];
let faults: (Response | 'network-before' | 'network-after')[] = [];

const dispatch = async (input: string, init: RequestInit = {}): Promise<Response> => {
	const url = new URL(input, 'http://localhost');
	const method = (init.method ?? 'GET').toUpperCase();
	const request = new Request(url, { ...init, method });
	const key = request.headers.get('idempotency-key');

	const fault = faults.shift();
	if (fault === 'network-before') throw new TypeError('Failed to fetch');
	if (fault instanceof Response) {
		calls.push({ method, path: url.pathname, key, status: fault.status });
		return fault;
	}

	const route = routes.find((r) => r.pattern.test(url.pathname));
	if (!route) throw new Error(`no route for ${method} ${url.pathname}`);
	const params = { id: url.pathname.match(route.pattern)?.[1] ?? '' };
	const mod = await route.load();
	const handler = mod[method] as Handler;

	const event = {
		request,
		url,
		params,
		locals: { user: { id: userId } }
	} as unknown as RequestEvent;
	const resolve = (e: RequestEvent) => handler(e);

	// Mirrors hooks.server.ts idempotencyHandle.
	const { withIdempotency } = await import('$lib/server/sync/idempotency');
	const { readIdempotencyKey } = await import('$lib/server/sync/headers');
	const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
	const idemKey = readIdempotencyKey(request);
	const response =
		isWrite && idemKey
			? await withIdempotency(event, resolve, userId, idemKey)
			: await resolve(event);

	calls.push({ method, path: url.pathname, key, status: response.status });
	if (fault === 'network-after') throw new TypeError('Failed to fetch');
	return response;
};

const TEMP_FOOD = '11111111-1111-4111-8111-111111111111';
const TEMP_ENTRY = '22222222-2222-4222-8222-222222222222';
const MISSING = '33333333-3333-4333-8333-333333333333';

const foodBody = (name: string) => ({
	name,
	servingSize: 100,
	servingUnit: 'g' as const,
	calories: 100,
	protein: 5,
	carbs: 10,
	fat: 2,
	fiber: 1
});

let dexie: typeof import('$lib/db');
let queue: typeof import('$lib/stores/offline-queue');
let sync: typeof import('$lib/stores/sync');

beforeAll(async () => {
	dexie = await import('$lib/db');
	queue = await import('$lib/stores/offline-queue');
	sync = await import('$lib/stores/sync');
});

const seedFood = async (uid: string, name: string, updatedAt?: Date) => {
	const db = getTestDB(dbUrl);
	const [food] = await db
		.insert(foods)
		.values({ userId: uid, ...foodBody(name), ...(updatedAt ? { updatedAt } : {}) })
		.returning();
	return food;
};

const seedEntry = async (foodId: string, updatedAt: Date) => {
	const db = getTestDB(dbUrl);
	const [entry] = await db
		.insert(foodEntries)
		.values({
			userId,
			foodId,
			date: '2026-06-01',
			mealType: 'Breakfast',
			servings: 1,
			updatedAt
		})
		.returning();
	return entry;
};

const queueRows = () => dexie.db.syncQueue.toArray();

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(idempotencyKeys);
	await db.delete(foodEntries);
	await db.delete(foods);
	await db.delete(users);
	const [a] = await db
		.insert(users)
		.values({ infomaniakSub: `replay-a-${Date.now()}-${Math.random()}` })
		.returning();
	const [b] = await db
		.insert(users)
		.values({ infomaniakSub: `replay-b-${Date.now()}-${Math.random()}` })
		.returning();
	userId = a.id;
	otherUserId = b.id;

	await Promise.all(dexie.db.tables.map((t) => t.clear()));
	Object.values(syncState).forEach((fn) => fn.mockClear());
	calls = [];
	faults = [];
	vi.stubGlobal('navigator', { onLine: true });
	vi.stubGlobal('fetch', vi.fn(dispatch));
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('idempotent replay of a queued create', () => {
	it('two sends with the same key create exactly one row and return the identical response', async () => {
		const headers = {
			'content-type': 'application/json',
			'idempotency-key': 'key-double-send',
			'x-client-edited-at': new Date().toISOString()
		};
		const body = JSON.stringify(foodBody('Twice'));
		const first = await dispatch('/api/foods', { method: 'POST', headers, body });
		const second = await dispatch('/api/foods', { method: 'POST', headers, body });

		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect(second.headers.get('x-idempotent-replay')).toBe('true');
		expect(await second.json()).toEqual(await first.json());

		const rows = await getTestDB(dbUrl).select().from(foods).where(eq(foods.userId, userId));
		expect(rows).toHaveLength(1);
	});

	it('a lost ack (server applied, network dropped) is retried by the client without duplicating', async () => {
		await queue.enqueue('POST', '/api/foods', foodBody('Lost ack'), {
			affectedTable: 'foods',
			affectedId: TEMP_FOOD
		});
		const [queued] = await queueRows();
		faults = ['network-after'];

		expect(await sync.syncQueue()).toBe(0);
		// The write landed, but the client never saw the answer, so it keeps the item.
		expect(await getTestDB(dbUrl).select().from(foods)).toHaveLength(1);
		expect(await queueRows()).toHaveLength(1);
		expect((await queueRows())[0].idempotencyKey).toBe(queued.idempotencyKey);

		expect(await sync.syncQueue()).toBe(1);
		expect(await queueRows()).toHaveLength(0);
		expect(await getTestDB(dbUrl).select().from(foods)).toHaveLength(1);
		expect(calls).toHaveLength(2);
		expect(calls[0].key).toBe(calls[1].key);
		expect(calls[1].status).toBe(201);
	});

	it('replaying the same PATCH key does not re-apply an edit that a later edit superseded', async () => {
		const food = await seedFood(userId, 'Orig', new Date('2026-06-01T10:00:00Z'));
		const headers = {
			'content-type': 'application/json',
			'idempotency-key': 'key-patch-1',
			'x-client-edited-at': '2026-06-02T10:00:00.000Z'
		};
		const patch = () =>
			dispatch(`/api/foods/${food.id}`, {
				method: 'PATCH',
				headers,
				body: JSON.stringify({ name: 'Edit A' })
			});
		expect((await patch()).status).toBe(200);
		// A later edit lands (e.g. from another device).
		const later = await dispatch(`/api/foods/${food.id}`, {
			method: 'PATCH',
			headers: {
				...headers,
				'idempotency-key': 'key-patch-2',
				'x-client-edited-at': '2026-06-03T10:00:00.000Z'
			},
			body: JSON.stringify({ name: 'Edit B' })
		});
		expect(later.status).toBe(200);

		const replay = await patch();
		expect(replay.status).toBe(200);
		expect(replay.headers.get('x-idempotent-replay')).toBe('true');
		const [row] = await getTestDB(dbUrl).select().from(foods).where(eq(foods.id, food.id));
		expect(row.name).toBe('Edit B');
	});

	it('the same key reused against another endpoint is refused with 422 and parked by the client', async () => {
		await queue.enqueue('POST', '/api/foods', foodBody('First'), { idempotencyKey: 'shared' });
		await queue.enqueue(
			'POST',
			'/api/entries',
			{ quickName: 'x', quickCalories: 10, mealType: 'Lunch', servings: 1, date: '2026-06-01' },
			{ idempotencyKey: 'shared' }
		);
		await sync.syncQueue();

		expect(calls.map((c) => c.status)).toEqual([201, 422]);
		expect(await queue.countFailed()).toBe(1);
		expect(await getTestDB(dbUrl).select().from(foodEntries)).toHaveLength(0);
	});
});

describe('last-write-wins against server state', () => {
	it('an older queued edit does not overwrite a newer server row; the client drops it and reports a conflict', async () => {
		const food = await seedFood(userId, 'Server version', new Date('2026-06-10T12:00:00Z'));
		await queue.enqueue(
			'PATCH',
			`/api/foods/${food.id}`,
			{ name: 'Stale offline edit' },
			{ affectedTable: 'foods', clientEditedAt: '2026-06-10T08:00:00.000Z' }
		);

		await sync.syncQueue();

		expect(calls[0].status).toBe(409);
		expect(await queueRows()).toHaveLength(0);
		expect(await queue.countFailed()).toBe(0);
		expect(syncState.addSyncConflict).toHaveBeenCalledWith('superseded');
		const [row] = await getTestDB(dbUrl).select().from(foods).where(eq(foods.id, food.id));
		expect(row.name).toBe('Server version');
		expect(row.updatedAt?.toISOString()).toBe('2026-06-10T12:00:00.000Z');
	});

	it('a newer queued edit wins and advances the server clock to the edit time', async () => {
		const food = await seedFood(userId, 'Server version', new Date('2026-06-10T12:00:00Z'));
		await queue.enqueue(
			'PATCH',
			`/api/foods/${food.id}`,
			{ name: 'Fresh offline edit' },
			{ affectedTable: 'foods', clientEditedAt: '2026-06-10T15:00:00.000Z' }
		);

		expect(await sync.syncQueue()).toBe(1);

		const [row] = await getTestDB(dbUrl).select().from(foods).where(eq(foods.id, food.id));
		expect(row.name).toBe('Fresh offline edit');
		expect(row.updatedAt?.toISOString()).toBe('2026-06-10T15:00:00.000Z');
	});

	it('edits replayed out of order by edit time converge on the newest one', async () => {
		const food = await seedFood(userId, 'v0', new Date('2026-06-01T00:00:00Z'));
		await queue.enqueue(
			'PATCH',
			`/api/foods/${food.id}`,
			{ name: 'v2 (newer edit, queued first)' },
			{ clientEditedAt: '2026-06-02T12:00:00.000Z' }
		);
		await queue.enqueue(
			'PATCH',
			`/api/foods/${food.id}`,
			{ name: 'v1 (older edit, queued second)' },
			{ clientEditedAt: '2026-06-02T11:00:00.000Z' }
		);

		await sync.syncQueue();

		expect(calls.map((c) => c.status)).toEqual([200, 409]);
		const [row] = await getTestDB(dbUrl).select().from(foods).where(eq(foods.id, food.id));
		expect(row.name).toBe('v2 (newer edit, queued first)');
	});

	it('a far-future client timestamp is clamped to now and cannot win every later conflict', async () => {
		const food = await seedFood(userId, 'Original', new Date('2026-06-01T00:00:00Z'));
		const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
		await queue.enqueue(
			'PATCH',
			`/api/foods/${food.id}`,
			{ name: 'From a skewed clock' },
			{ clientEditedAt: future }
		);
		const before = Date.now();
		expect(await sync.syncQueue()).toBe(1);
		const after = Date.now();

		let [row] = await getTestDB(dbUrl).select().from(foods).where(eq(foods.id, food.id));
		expect(row.name).toBe('From a skewed clock');
		expect(row.updatedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
		expect(row.updatedAt!.getTime()).toBeLessThanOrEqual(after);

		// A genuine edit made a moment later still wins.
		await queue.enqueue(
			'PATCH',
			`/api/foods/${food.id}`,
			{ name: 'Honest later edit' },
			{ clientEditedAt: new Date(Date.now() + 5).toISOString() }
		);
		await new Promise((r) => setTimeout(r, 20));
		expect(await sync.syncQueue()).toBe(1);
		[row] = await getTestDB(dbUrl).select().from(foods).where(eq(foods.id, food.id));
		expect(row.name).toBe('Honest later edit');
	});

	it('a queued create with a future timestamp is also stamped no later than now', async () => {
		const future = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
		await queue.enqueue('POST', '/api/foods', foodBody('Future create'), {
			clientEditedAt: future
		});
		await sync.syncQueue();
		const [row] = await getTestDB(dbUrl).select().from(foods);
		expect(row.updatedAt!.getTime()).toBeLessThanOrEqual(Date.now());
	});

	it('an offline create seeds the LWW clock from its edit time, so a later offline edit is not rejected', async () => {
		const createdAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
		const editedAt = new Date(Date.now() - 3600 * 1000).toISOString();
		await queue.enqueue('POST', '/api/foods', foodBody('Made offline'), {
			affectedTable: 'foods',
			affectedId: TEMP_FOOD,
			clientEditedAt: createdAt
		});
		await queue.enqueue(
			'PATCH',
			`/api/foods/${TEMP_FOOD}`,
			{ name: 'Renamed offline' },
			{ affectedTable: 'foods', clientEditedAt: editedAt }
		);

		expect(await sync.syncQueue()).toBe(2);
		expect(calls.map((c) => c.status)).toEqual([201, 200]);
		const [row] = await getTestDB(dbUrl).select().from(foods);
		expect(row.name).toBe('Renamed offline');
		expect(row.updatedAt?.toISOString()).toBe(editedAt);
	});

	it('a queued entry edit loses to a newer server row the same way', async () => {
		const food = await seedFood(userId, 'Banana');
		const entry = await seedEntry(food.id, new Date('2026-06-10T12:00:00Z'));
		await queue.enqueue(
			'PATCH',
			`/api/entries/${entry.id}`,
			{ servings: 9 },
			{ affectedTable: 'foodEntries', clientEditedAt: '2026-06-10T09:00:00.000Z' }
		);
		await sync.syncQueue();
		expect(calls[0].status).toBe(409);
		const [row] = await getTestDB(dbUrl).select().from(foodEntries);
		expect(row.servings).toBe(1);
	});

	it('an older queued delete does not destroy a newer server edit', async () => {
		const food = await seedFood(userId, 'Banana');
		const entry = await seedEntry(food.id, new Date('2026-06-10T12:00:00Z'));
		await queue.enqueue(
			'DELETE',
			`/api/entries/${entry.id}`,
			{},
			{
				affectedTable: 'foodEntries',
				clientEditedAt: '2026-06-10T09:00:00.000Z'
			}
		);
		await sync.syncQueue();

		expect(calls[0].status).toBe(409);
		expect(await queueRows()).toHaveLength(0);
		expect(syncState.addSyncConflict).toHaveBeenCalledWith('superseded');
		expect(await getTestDB(dbUrl).select().from(foodEntries)).toHaveLength(1);
	});

	it('a newer queued delete does remove the row', async () => {
		const food = await seedFood(userId, 'Banana');
		const entry = await seedEntry(food.id, new Date('2026-06-10T12:00:00Z'));
		await queue.enqueue(
			'DELETE',
			`/api/entries/${entry.id}`,
			{},
			{
				affectedTable: 'foodEntries',
				clientEditedAt: '2026-06-10T18:00:00.000Z'
			}
		);
		await sync.syncQueue();
		expect(calls[0].status).toBe(204);
		expect(await getTestDB(dbUrl).select().from(foodEntries)).toHaveLength(0);
	});
});

describe('how the client classifies real server responses', () => {
	it('400 invalid body: parked in the dead-letter list with the server’s reason, not retried', async () => {
		await queue.enqueue('POST', '/api/foods', { name: '' }, { affectedTable: 'foods' });
		await sync.syncQueue();

		expect(calls[0].status).toBe(400);
		expect(await queue.countFailed()).toBe(1);
		const [failed] = await queue.listFailed();
		expect(failed.failureReason).toBe('Validation failed');
		expect(syncState.addSyncError).toHaveBeenCalledTimes(1);
		expect(await queue.drainQueue()).toHaveLength(0);

		await sync.syncQueue();
		expect(calls).toHaveLength(1);
	});

	it('400 malformed id in the URL: parked', async () => {
		await queue.enqueue(
			'PATCH',
			'/api/foods/not-a-uuid',
			{ name: 'x' },
			{ affectedTable: 'foods' }
		);
		await sync.syncQueue();
		expect(calls[0].status).toBe(400);
		expect(await queue.countFailed()).toBe(1);
	});

	it('404 entry referencing a deleted food: removed from the queue and reported as "deleted"', async () => {
		await queue.enqueue(
			'POST',
			'/api/entries',
			{ foodId: MISSING, mealType: 'Lunch', servings: 1, date: '2026-06-01' },
			{ affectedTable: 'foodEntries', affectedId: TEMP_ENTRY }
		);
		await sync.syncQueue();

		expect(calls[0].status).toBe(404);
		expect(await queueRows()).toHaveLength(0);
		expect(await queue.countFailed()).toBe(0);
		expect(syncState.addSyncConflict).toHaveBeenCalledWith('deleted');
		expect(await getTestDB(dbUrl).select().from(foodEntries)).toHaveLength(0);
	});

	it('404 entry referencing another user’s food is treated the same (no leak, not parked)', async () => {
		const foreign = await seedFood(otherUserId, 'Bob’s protein');
		await queue.enqueue('POST', '/api/entries', {
			foodId: foreign.id,
			mealType: 'Lunch',
			servings: 1,
			date: '2026-06-01'
		});
		await sync.syncQueue();
		expect(calls[0].status).toBe(404);
		expect(await queue.countFailed()).toBe(0);
		expect(await getTestDB(dbUrl).select().from(foodEntries)).toHaveLength(0);
	});

	it('edit of a row deleted elsewhere (edit time present) surfaces as a conflict and is dropped', async () => {
		await queue.enqueue(
			'PATCH',
			`/api/foods/${MISSING}`,
			{ name: 'ghost' },
			{ affectedTable: 'foods' }
		);
		await sync.syncQueue();
		expect(calls[0].status).toBe(409);
		expect(calls).toHaveLength(1);
		expect(await queueRows()).toHaveLength(0);
		expect(syncState.addSyncConflict).toHaveBeenCalled();
	});

	it('409 has_entries on a food delete has no sync-conflict header, so it is parked', async () => {
		const food = await seedFood(userId, 'In use');
		await seedEntry(food.id, new Date('2026-06-01T00:00:00Z'));
		await queue.enqueue('DELETE', `/api/foods/${food.id}`, {}, { affectedTable: 'foods' });
		await sync.syncQueue();

		expect(calls[0].status).toBe(409);
		expect(await queue.countFailed()).toBe(1);
		expect((await queue.listFailed())[0].failureReason).toBe('has_entries');
		expect(await getTestDB(dbUrl).select().from(foods)).toHaveLength(1);
	});

	it('503 request_in_progress (idempotency claim still in flight): retried with backoff, not parked', async () => {
		await queue.enqueue('POST', '/api/foods', foodBody('Racing'), {
			idempotencyKey: 'key-in-flight'
		});
		await getTestDB(dbUrl).insert(idempotencyKeys).values({
			userId,
			key: 'key-in-flight',
			method: 'POST',
			path: '/api/foods'
		});

		await sync.syncQueue();

		expect(calls[0].status).toBe(503);
		expect(await queue.countFailed()).toBe(0);
		const [item] = await queueRows();
		expect(item.retryCount).toBe(1);
		expect(item.nextAttemptAt).toBeGreaterThan(Date.now());
		expect(await getTestDB(dbUrl).select().from(foods)).toHaveLength(0);
	});

	it.each([500, 502, 503])(
		'%i from the server: kept and retried, then succeeds on the retry',
		async (status) => {
			await queue.enqueue('POST', '/api/foods', foodBody(`Retry ${status}`), {
				affectedTable: 'foods'
			});
			faults = [new Response(JSON.stringify({ error: 'boom' }), { status })];

			await sync.syncQueue();
			expect(await queue.countFailed()).toBe(0);
			const [item] = await queueRows();
			expect(item.retryCount).toBe(1);
			expect(await getTestDB(dbUrl).select().from(foods)).toHaveLength(0);

			// Backoff elapsed.
			await dexie.db.syncQueue.update(item.id!, { nextAttemptAt: 0 });
			expect(await sync.syncQueue()).toBe(1);
			expect(await queueRows()).toHaveLength(0);
			expect(await getTestDB(dbUrl).select().from(foods)).toHaveLength(1);
		}
	);

	it.each([408, 425, 429])(
		'%i (rate limited / too early) is transient: retried, never parked',
		async (status) => {
			await queue.enqueue('POST', '/api/foods', foodBody(`Limited ${status}`), {
				affectedTable: 'foods'
			});
			faults = [new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status })];

			await sync.syncQueue();
			expect(await queue.countFailed()).toBe(0);
			const [item] = await queueRows();
			expect(item.retryCount).toBe(1);
			expect(item.nextAttemptAt).toBeGreaterThan(Date.now());

			await dexie.db.syncQueue.update(item.id!, { nextAttemptAt: 0 });
			expect(await sync.syncQueue()).toBe(1);
			expect(await getTestDB(dbUrl).select().from(foods)).toHaveLength(1);
		}
	);

	it('a network error keeps the item untouched and stops the pass', async () => {
		await queue.enqueue('POST', '/api/foods', foodBody('Offline A'), { affectedTable: 'foods' });
		await queue.enqueue('POST', '/api/foods', foodBody('Offline B'), { affectedTable: 'foods' });
		faults = ['network-before'];

		expect(await sync.syncQueue()).toBe(0);
		expect(calls).toHaveLength(0);
		expect(await queueRows()).toHaveLength(2);
		expect(await queue.countFailed()).toBe(0);

		expect(await sync.syncQueue()).toBe(2);
		expect(await getTestDB(dbUrl).select().from(foods)).toHaveLength(2);
	});

	it('gives up on a persistently failing request after the retry cap and parks it', async () => {
		await queue.enqueue('POST', '/api/foods', foodBody('Never works'), { affectedTable: 'foods' });
		for (let i = 0; i < 5; i++) {
			faults = [new Response('{"error":"down"}', { status: 500 })];
			const [item] = await queueRows();
			await dexie.db.syncQueue.update(item.id!, { nextAttemptAt: 0 });
			await sync.syncQueue();
		}
		expect(await queue.countFailed()).toBe(1);
		expect((await queue.listFailed())[0].failureReason).toContain('after 5 retries');
	});
});

describe('replay ordering and dependencies', () => {
	const seedLocalFood = async () => {
		await dexie.db.foods.put({
			id: TEMP_FOOD,
			userId,
			name: 'Offline oats',
			brand: null,
			kind: 'food',
			servingSize: 100,
			servingUnit: 'g',
			calories: 100,
			protein: 5,
			carbs: 10,
			fat: 2,
			fiber: 1
		} as never);
	};

	it('create food, create entry referencing it, edit and delete the entry: the temp ids are remapped along the way', async () => {
		await seedLocalFood();
		await queue.enqueue('POST', '/api/foods', foodBody('Offline oats'), {
			affectedTable: 'foods',
			affectedId: TEMP_FOOD
		});
		await queue.enqueue(
			'POST',
			'/api/entries',
			{ foodId: TEMP_FOOD, mealType: 'Breakfast', servings: 2, date: '2026-06-01' },
			{ affectedTable: 'foodEntries', affectedId: TEMP_ENTRY }
		);
		await queue.enqueue(
			'PATCH',
			`/api/entries/${TEMP_ENTRY}`,
			{ servings: 3 },
			{ affectedTable: 'foodEntries', affectedId: TEMP_ENTRY }
		);

		expect(await sync.syncQueue()).toBe(3);
		expect(calls.map((c) => `${c.method} ${c.status}`)).toEqual([
			'POST 201',
			'POST 201',
			'PATCH 200'
		]);
		expect(calls[2].path).not.toContain(TEMP_ENTRY);

		const db = getTestDB(dbUrl);
		const [food] = await db.select().from(foods);
		const [entry] = await db.select().from(foodEntries);
		expect(entry.foodId).toBe(food.id);
		expect(food.id).not.toBe(TEMP_FOOD);
		expect(entry.servings).toBe(3);
		expect(await queueRows()).toHaveLength(0);

		// The optimistic local row now lives under the server id.
		expect(await dexie.db.foods.get(TEMP_FOOD)).toBeUndefined();
		expect(await dexie.db.foods.get(food.id)).toBeDefined();

		// The entry logged by the queue is visible in the day totals path.
		const { listEntriesByDate } = await import('$lib/server/entries');
		const { items } = await listEntriesByDate(userId, '2026-06-01');
		expect(items).toHaveLength(1);
		expect(items[0].calories).toBe(100);
		expect(items[0].servings).toBe(3);
	});

	it('create then delete in one queue leaves nothing behind', async () => {
		await queue.enqueue('POST', '/api/foods', foodBody('Short-lived'), {
			affectedTable: 'foods',
			affectedId: TEMP_FOOD
		});
		await queue.enqueue('DELETE', `/api/foods/${TEMP_FOOD}`, {}, { affectedTable: 'foods' });

		expect(await sync.syncQueue()).toBe(2);
		expect(calls.map((c) => c.status)).toEqual([201, 204]);
		expect(await getTestDB(dbUrl).select().from(foods)).toHaveLength(0);
	});

	it('a transient failure on the create holds back everything queued after it (strict FIFO)', async () => {
		await queue.enqueue('POST', '/api/foods', foodBody('Blocked'), {
			affectedTable: 'foods',
			affectedId: TEMP_FOOD
		});
		await queue.enqueue(
			'POST',
			'/api/entries',
			{ foodId: TEMP_FOOD, mealType: 'Lunch', servings: 1, date: '2026-06-01' },
			{ affectedTable: 'foodEntries', affectedId: TEMP_ENTRY }
		);
		faults = [new Response('{"error":"down"}', { status: 503 })];

		await sync.syncQueue();
		expect(calls).toHaveLength(1);
		expect(await queue.drainQueue()).toHaveLength(0); // create is still backing off

		const [create] = await queueRows();
		await dexie.db.syncQueue.update(create.id!, { nextAttemptAt: 0 });
		expect(await sync.syncQueue()).toBe(2);
		expect(await getTestDB(dbUrl).select().from(foodEntries)).toHaveLength(1);
	});

	it('a rejected create dead-letters the queued writes that depend on it without sending them', async () => {
		await queue.enqueue(
			'POST',
			'/api/foods',
			{ name: '' },
			{
				affectedTable: 'foods',
				affectedId: TEMP_FOOD
			}
		);
		await queue.enqueue(
			'POST',
			'/api/entries',
			{ foodId: TEMP_FOOD, mealType: 'Lunch', servings: 1, date: '2026-06-01' },
			{ affectedTable: 'foodEntries', affectedId: TEMP_ENTRY }
		);
		await queue.enqueue('POST', '/api/foods', foodBody('Independent'), { affectedTable: 'foods' });

		await sync.syncQueue();

		expect(calls.map((c) => c.status)).toEqual([400, 201]); // dependent entry never sent
		expect(await queue.countFailed()).toBe(2);
		expect(await getTestDB(dbUrl).select().from(foodEntries)).toHaveLength(0);
		const foodsLeft = await getTestDB(dbUrl).select().from(foods);
		expect(foodsLeft.map((f) => f.name)).toEqual(['Independent']);
		expect(syncState.addSyncError).toHaveBeenCalledWith('dependency');
	});

	it('replaying a delete twice is idempotent: same key replays 204, a fresh key on the gone row is also 204', async () => {
		const food = await seedFood(userId, 'Banana');
		const entry = await seedEntry(food.id, new Date('2026-06-01T00:00:00Z'));
		const headers = {
			'idempotency-key': 'key-delete',
			'x-client-edited-at': '2026-06-02T00:00:00.000Z'
		};

		const first = await dispatch(`/api/entries/${entry.id}`, { method: 'DELETE', headers });
		const replay = await dispatch(`/api/entries/${entry.id}`, { method: 'DELETE', headers });
		const freshKey = await dispatch(`/api/entries/${entry.id}`, {
			method: 'DELETE',
			headers: { ...headers, 'idempotency-key': 'key-delete-2' }
		});

		expect(first.status).toBe(204);
		expect(replay.status).toBe(204);
		expect(replay.headers.get('x-idempotent-replay')).toBe('true');
		expect(freshKey.status).toBe(204);
		expect(await getTestDB(dbUrl).select().from(foodEntries)).toHaveLength(0);
	});

	it('the client treats a delete of an already-deleted row as success without a conflict message', async () => {
		await queue.enqueue('DELETE', `/api/entries/${MISSING}`, {}, { affectedTable: 'foodEntries' });
		expect(await sync.syncQueue()).toBe(1);
		expect(await queueRows()).toHaveLength(0);
		expect(syncState.addSyncConflict).not.toHaveBeenCalled();
	});

	it('draining the same queue twice never duplicates writes', async () => {
		await queue.enqueue('POST', '/api/foods', foodBody('Once'), { affectedTable: 'foods' });
		await queue.enqueue(
			'POST',
			'/api/entries',
			{
				quickName: 'Snack',
				quickCalories: 100,
				mealType: 'Snacks',
				servings: 1,
				date: '2026-06-01'
			},
			{ affectedTable: 'foodEntries' }
		);
		await sync.syncQueue();
		await sync.syncQueue();
		expect(await getTestDB(dbUrl).select().from(foods)).toHaveLength(1);
		expect(await getTestDB(dbUrl).select().from(foodEntries)).toHaveLength(1);
		expect(calls).toHaveLength(2);
	});
});
