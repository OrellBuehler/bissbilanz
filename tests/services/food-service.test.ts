import { describe, expect, test, vi, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/index';
import type { DexieFood } from '../../src/lib/db/types';

const putCalls: Array<{ id: string; body: unknown }> = [];
let putResponse: () => Promise<{ data?: unknown; response: Response }> = async () => ({
	data: { labels: ['banana', 'fruit'], dropped: [] },
	response: new Response(null, { status: 200 })
});

vi.mock('$lib/api/client', () => ({
	api: {
		PUT: async (path: string, opts: { params: { path: { id: string } }; body: unknown }) => {
			putCalls.push({ id: opts.params.path.id, body: opts.body });
			return putResponse();
		}
	}
}));

vi.mock('$lib/stores/offline-queue', () => ({
	enqueue: vi.fn()
}));

const { foodService } = await import('../../src/lib/services/food-service.svelte');
const { enqueue } = await import('$lib/stores/offline-queue');
const mockEnqueue = enqueue as ReturnType<typeof vi.fn>;

const food = (overrides: Partial<DexieFood>): DexieFood =>
	({
		id: 'f1',
		userId: 'u',
		name: 'Banane',
		brand: null,
		kind: 'food',
		servingSize: 100,
		servingUnit: 'g',
		calories: 89,
		protein: 1,
		carbs: 23,
		fat: 0,
		fiber: 2,
		barcode: null,
		isFavorite: false,
		labels: [],
		createdAt: null,
		updatedAt: '2026-09-01T00:00:00.000Z',
		...overrides
	}) as DexieFood;

const firstValue = <T>(observable: {
	subscribe: (fn: (v: T) => void) => { unsubscribe(): void };
}) =>
	new Promise<T>((resolve) => {
		const sub = observable.subscribe((value) => {
			resolve(value);
			queueMicrotask(() => sub.unsubscribe());
		});
	});

beforeEach(async () => {
	putCalls.length = 0;
	mockEnqueue.mockClear();
	await db.foods.clear();
	await db.foods.bulkPut([
		food({ id: 'f1', name: 'Banane', labels: ['banana', 'fruit'] }),
		food({ id: 'f2', name: 'Vollkornbrot', brand: 'Coop', labels: ['bread'] }),
		food({ id: 'f3', name: 'Aufstrich', brand: 'Bread & Co', labels: [] }),
		food({ id: 's1', name: 'Vitamin D', kind: 'supplement', labels: ['bread'] })
	]);
});

describe('foodService.search', () => {
	test('matches labels offline, ranked after name and before brand', async () => {
		const rows = await firstValue<DexieFood[]>(foodService.search('bread'));
		expect(rows.map((r) => r.id)).toEqual(['f2', 'f3']);
	});

	test('never surfaces supplement backing foods', async () => {
		const rows = await firstValue<DexieFood[]>(foodService.search('bread'));
		expect(rows.some((r) => r.kind === 'supplement')).toBe(false);
	});
});

describe('foodService.setLabels', () => {
	test('writes optimistically, then adopts the server result', async () => {
		putResponse = async () => ({
			data: { labels: ['apple', 'fruit'], dropped: ['zzz'] },
			response: new Response(null, { status: 200 })
		});
		const dropped = await foodService.setLabels('f1', ['Apples', 'fruit', 'zzz']);
		expect(dropped).toEqual(['zzz']);
		expect(putCalls).toEqual([{ id: 'f1', body: { labels: ['Apples', 'fruit', 'zzz'] } }]);
		const row = await db.foods.get('f1');
		expect(row?.labels).toEqual(['apple', 'fruit']);
		expect(row?.updatedAt).not.toBe('2026-09-01T00:00:00.000Z');
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	test('keeps the normalized local labels and queues the write when offline', async () => {
		putResponse = async () => {
			throw new TypeError('Failed to fetch');
		};
		const dropped = await foodService.setLabels('f2', ['Breads', 'toast']);
		expect(dropped).toEqual([]);
		expect((await db.foods.get('f2'))?.labels).toEqual(['bread', 'toast']);
		expect(mockEnqueue).toHaveBeenCalledWith(
			'PUT',
			'/api/foods/f2/labels',
			{ labels: ['Breads', 'toast'] },
			{ affectedTable: 'foods', affectedId: 'f2' }
		);
		// The optimistic row is what search sees while the write waits.
		const rows = await firstValue<DexieFood[]>(foodService.search('toast'));
		expect(rows.map((r) => r.id)).toEqual(['f2']);
	});
});
