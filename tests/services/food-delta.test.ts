import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../src/lib/db/index';
import type { DexieFood } from '../../src/lib/db/types';

type GetCall = { path: string; query?: Record<string, unknown> };
const calls: GetCall[] = [];
let handler: (call: GetCall) => Promise<{ data?: unknown }> = async () => ({});

vi.mock('$lib/api/client', () => ({
	api: {
		GET: async (path: string, opts?: { params?: { query?: Record<string, unknown> } }) => {
			const call = { path, query: opts?.params?.query };
			calls.push(call);
			return handler(call);
		}
	}
}));

const { foodService } = await import('../../src/lib/services/food-service.svelte');
const { enqueue } = await import('../../src/lib/stores/offline-queue');
const { DELTA_KEY, DELTA_OVERLAP_MS, RECONCILE_INTERVAL_MS } =
	await import('../../src/lib/services/food-delta');

const food = (id: string, serverModifiedAt?: string, overrides: Partial<DexieFood> = {}) =>
	({
		id,
		userId: 'u',
		name: `Food ${id}`,
		brand: null,
		kind: 'food',
		servingSize: 100,
		servingUnit: 'g',
		calories: 1,
		protein: 0,
		carbs: 0,
		fat: 0,
		fiber: 0,
		barcode: null,
		isFavorite: false,
		labels: [],
		createdAt: null,
		updatedAt: null,
		serverModifiedAt,
		...overrides
	}) as DexieFood;

const feed =
	(pages: DexieFood[][], ids: string[] = []) =>
	async (call: GetCall) => {
		if (call.path === '/api/foods/ids') return { data: { ids } };
		const index = call.query?.after ? Number(String(call.query.after).replace('page-', '')) : 0;
		return {
			data: {
				foods: pages[index] ?? [],
				total: (pages[index] ?? []).length,
				nextCursor: index + 1 < pages.length ? `page-${index + 1}` : null
			}
		};
	};

const deltaCalls = () => calls.filter((c) => c.path === '/api/foods');

beforeEach(async () => {
	calls.length = 0;
	await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('foodService.refresh (delta)', () => {
	test('a first sync pages from the epoch via cursors and stores the checkpoint', async () => {
		handler = feed(
			[
				[food('a', '2026-10-01T10:00:00.000Z'), food('b', '2026-10-01T10:00:01.000Z')],
				[food('c', '2026-10-02T09:00:00.500Z')]
			],
			['a', 'b', 'c']
		);

		await foodService.refresh();

		expect(deltaCalls()).toEqual([
			{
				path: '/api/foods',
				query: { modifiedSince: '1970-01-01T00:00:00.000Z', limit: 1000 }
			},
			{ path: '/api/foods', query: { after: 'page-1', limit: 1000 } }
		]);
		expect((await db.foods.toArray()).map((f) => f.id).sort()).toEqual(['a', 'b', 'c']);
		expect((await db.syncMeta.get(DELTA_KEY))?.deltaCursor).toBe('2026-10-02T09:00:00.500Z');
	});

	test('the next sync resumes one overlap before the checkpoint', async () => {
		await db.syncMeta.put({
			tableName: DELTA_KEY,
			lastSyncedAt: 0,
			deltaCursor: '2026-10-02T09:00:00.500Z',
			reconciledAt: Date.now()
		});
		handler = feed([[food('d', '2026-10-02T09:00:30.000Z')]]);

		await foodService.refresh();

		expect(deltaCalls()).toHaveLength(1);
		expect(deltaCalls()[0].query).toEqual({
			modifiedSince: new Date(
				Date.parse('2026-10-02T09:00:00.500Z') - DELTA_OVERLAP_MS
			).toISOString(),
			limit: 1000
		});
		expect((await db.syncMeta.get(DELTA_KEY))?.deltaCursor).toBe('2026-10-02T09:00:30.000Z');
	});

	test('the checkpoint never moves backwards when the overlap re-delivers older rows', async () => {
		await db.syncMeta.put({
			tableName: DELTA_KEY,
			lastSyncedAt: 0,
			deltaCursor: '2026-10-02T09:00:00.500Z',
			reconciledAt: Date.now()
		});
		handler = feed([[food('old', '2026-10-02T08:59:30.000Z')]]);

		await foodService.refresh();

		expect((await db.syncMeta.get(DELTA_KEY))?.deltaCursor).toBe('2026-10-02T09:00:00.500Z');
	});

	test('an empty delta keeps the checkpoint and writes nothing', async () => {
		await db.syncMeta.put({
			tableName: DELTA_KEY,
			lastSyncedAt: 0,
			deltaCursor: '2026-10-02T09:00:00.500Z',
			reconciledAt: Date.now()
		});
		handler = feed([[]]);

		await foodService.refresh();

		expect(await db.foods.count()).toBe(0);
		expect((await db.syncMeta.get(DELTA_KEY))?.deltaCursor).toBe('2026-10-02T09:00:00.500Z');
		expect(calls.some((c) => c.path === '/api/foods/ids')).toBe(false);
	});

	test('keeps the progress of an interrupted first sync', async () => {
		handler = async (call) => {
			if (call.query?.after) throw new Error('network down');
			return {
				data: {
					foods: [food('a', '2026-10-01T10:00:00.000Z')],
					total: 1,
					nextCursor: 'page-1'
				}
			};
		};

		await foodService.refresh();

		expect(await db.foods.count()).toBe(1);
		const meta = await db.syncMeta.get(DELTA_KEY);
		expect(meta?.deltaCursor).toBe('2026-10-01T10:00:00.000Z');
		expect(meta?.reconciledAt).toBeUndefined();
	});

	test('does not overwrite a row that has a queued local write', async () => {
		await db.foods.put(food('edited', undefined, { name: 'Local edit' }));
		await enqueue(
			'PATCH',
			'/api/foods/edited',
			{},
			{ affectedTable: 'foods', affectedId: 'edited' }
		);
		handler = feed(
			[
				[
					food('edited', '2026-10-01T10:00:00.000Z', { name: 'Server copy' }),
					food('fresh', '2026-10-01T10:00:01.000Z')
				]
			],
			['edited', 'fresh']
		);

		await foodService.refresh();

		expect((await db.foods.get('edited'))?.name).toBe('Local edit');
		expect(await db.foods.get('fresh')).toBeDefined();
	});

	test('overlapping calls coalesce into one extra pass', async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let first = true;
		handler = async (call) => {
			if (call.path === '/api/foods/ids') return { data: { ids: [] } };
			if (first) {
				first = false;
				await gate;
			}
			return { data: { foods: [], total: 0, nextCursor: null } };
		};

		const a = foodService.refresh();
		const b = foodService.refresh();
		const c = foodService.refresh();
		release();
		await Promise.all([a, b, c]);

		expect(deltaCalls()).toHaveLength(2);
	});

	test('a network error is swallowed and leaves the mirror untouched', async () => {
		await db.foods.put(food('keep'));
		handler = async () => {
			throw new Error('offline');
		};

		await expect(foodService.refresh()).resolves.toBeUndefined();
		expect(await db.foods.get('keep')).toBeDefined();
	});
});

describe('deletion reconciliation', () => {
	test('runs on the first sync and drops regular foods the server no longer has', async () => {
		await db.foods.bulkPut([
			food('gone'),
			food('kept'),
			food('supp', undefined, { kind: 'supplement' })
		]);
		handler = feed([[]], ['kept']);

		await foodService.refresh();

		expect((await db.foods.toArray()).map((f) => f.id).sort()).toEqual(['kept', 'supp']);
		expect((await db.syncMeta.get(DELTA_KEY))?.reconciledAt).toBeGreaterThan(0);
	});

	test('keeps rows with a queued local write, such as an offline-created food', async () => {
		await db.foods.bulkPut([food('offline-new'), food('gone')]);
		await enqueue('POST', '/api/foods', {}, { affectedTable: 'foods', affectedId: 'offline-new' });
		handler = feed([[]], []);

		await foodService.refresh();

		expect((await db.foods.toArray()).map((f) => f.id)).toEqual(['offline-new']);
	});

	test('is skipped while the last reconcile is recent and repeated once it is old', async () => {
		await db.foods.put(food('gone'));
		await db.syncMeta.put({
			tableName: DELTA_KEY,
			lastSyncedAt: 0,
			deltaCursor: '2026-10-02T09:00:00.500Z',
			reconciledAt: Date.now() - 1000
		});
		handler = feed([[]], []);

		await foodService.refresh();
		expect(await db.foods.get('gone')).toBeDefined();
		expect(calls.some((c) => c.path === '/api/foods/ids')).toBe(false);

		await db.syncMeta.put({
			tableName: DELTA_KEY,
			lastSyncedAt: 0,
			deltaCursor: '2026-10-02T09:00:00.500Z',
			reconciledAt: Date.now() - RECONCILE_INTERVAL_MS - 1000
		});
		await foodService.refresh();
		expect(await db.foods.get('gone')).toBeUndefined();
	});

	test('does not reconcile when the server returned no data', async () => {
		await db.foods.put(food('keep'));
		handler = async (call) => (call.path === '/api/foods/ids' ? {} : feed([[]])(call));

		await foodService.refresh();

		expect(await db.foods.get('keep')).toBeDefined();
	});
});

describe('foodService.removeLocal', () => {
	test('drops the given rows from the mirror', async () => {
		await db.foods.bulkPut([food('a'), food('b')]);
		await foodService.removeLocal(['a']);
		expect((await db.foods.toArray()).map((f) => f.id)).toEqual(['b']);
	});
});
