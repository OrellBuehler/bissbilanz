import { test, expect } from 'bun:test';
import { crawlMigros } from './crawl-migros';
import { newStats } from '../../types';
import type { MigrosClient, MigrosProductDetail } from './types';

function makeClient(
	products: Record<string, MigrosProductDetail | null>,
	ids: string[]
): MigrosClient {
	return {
		async *listProductIds() {
			let page = 0;
			for (const id of ids) yield { id, cursor: { category: 'all', page: page++ } };
		},
		async getProduct(id) {
			return products[id] ?? null;
		}
	};
}

const base: MigrosProductDetail = {
	id: '1',
	name: 'A',
	gtins: ['7610200000001'],
	productUrl: 'https://m/1',
	nutrition: { basis: '100g', energyKcal: 64, protein: 3.3, carbohydrate: 4.8, fat: 3.5, fiber: 0 }
};

test('emits normalized products and dedupes repeated ids and barcodes', async () => {
	const client = makeClient(
		{
			'1': base,
			'2': { ...base, id: '2', name: 'B', gtins: ['7610200000002'] },
			'3': { ...base, id: '3', name: 'A-dup', gtins: ['7610200000001'] } // dup barcode
		},
		['1', '2', '2', '3'] // '2' listed twice
	);
	const stats = newStats();
	const out = [];
	for await (const p of crawlMigros(client, { stats, sleep: async () => {} })) out.push(p);
	expect(out.map((p) => p.product.name).sort()).toEqual(['A', 'B']);
	expect(stats.emitted).toBe(2);
	expect(stats.dropReasons['dup']).toBe(2); // one dup id + one dup barcode
});

test('attaches the category label of the product to the emitted food', async () => {
	const client = makeClient(
		{
			'1': { ...base, category: 'Brot & Backwaren' },
			'2': { ...base, id: '2', gtins: ['7610200000002'] }
		},
		['1', '2']
	);
	const out = [];
	for await (const p of crawlMigros(client, { sleep: async () => {} })) out.push(p);
	expect(out.map((p) => p.categories)).toEqual([['Brot & Backwaren'], []]);
});

test('skips ids whose product detail is null', async () => {
	const client = makeClient({ '1': base, '9': null }, ['1', '9']);
	const out = [];
	for await (const p of crawlMigros(client, { sleep: async () => {} })) out.push(p);
	expect(out.length).toBe(1);
});

test('respects the limit option', async () => {
	const client = makeClient({ '1': base, '2': { ...base, id: '2', gtins: ['7610200000002'] } }, [
		'1',
		'2'
	]);
	const out = [];
	for await (const p of crawlMigros(client, { limit: 1, sleep: async () => {} })) out.push(p);
	expect(out.length).toBe(1);
});

test('checkpoints only emitted products (after yield), not dropped ones', async () => {
	const client = makeClient(
		{ '1': base, '2': { ...base, id: '2', name: 'B', gtins: ['7610200000002'] }, '9': null },
		['1', '9', '2']
	);
	const cursors: Array<{ category: string; page: number }> = [];
	const out = [];
	for await (const p of crawlMigros(client, {
		sleep: async () => {},
		onCheckpoint: (c) => void cursors.push(c)
	}))
		out.push(p);
	// '9' has no detail (dropped) → not checkpointed; only the two emitted products are.
	expect(out.length).toBe(2);
	expect(cursors.length).toBe(2);
});

test('checkpoints id-less cursors from scanned batches without counting them as seen', async () => {
	const client: MigrosClient = {
		async *listProductIds() {
			yield { cursor: { category: 'ids', page: 10 } };
			yield { id: '1', cursor: { category: 'ids', page: 2 } };
			yield { cursor: { category: 'ids', page: 20 } };
		},
		async getProduct() {
			return base;
		}
	};
	const stats = newStats();
	const cursors: number[] = [];
	const out = [];
	for await (const p of crawlMigros(client, {
		stats,
		sleep: async () => {},
		onCheckpoint: (c) => void cursors.push(c.page)
	}))
		out.push(p);
	expect(cursors).toEqual([10, 2, 20]);
	expect(stats.seen).toBe(1);
	expect(out.length).toBe(1);
});

test('drops barcodes already spooled before a resume', async () => {
	const client = makeClient(
		{
			'1': base,
			'2': { ...base, id: '2', name: 'B', gtins: ['7610200000002'] }
		},
		['1', '2']
	);
	const stats = newStats();
	const out = [];
	for await (const p of crawlMigros(client, {
		stats,
		sleep: async () => {},
		seenBarcodes: ['7610200000001']
	}))
		out.push(p);
	expect(out.map((p) => p.product.name)).toEqual(['B']);
	expect(stats.dropReasons['dup']).toBe(1);
});

test('reports batch progress through onScan', async () => {
	const client: MigrosClient = {
		async *listProductIds() {
			yield { cursor: { category: 'ids', page: 100 }, progress: { scanned: 100, found: 0 } };
		},
		async getProduct() {
			return null;
		}
	};
	const seen: Array<[number, number]> = [];
	for await (const _ of crawlMigros(client, {
		onScan: (c, p) => void seen.push([c.page, p.scanned])
	}));
	expect(seen).toEqual([[100, 100]]);
});
