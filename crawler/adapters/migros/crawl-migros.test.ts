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
	expect(out.map((p) => p.name).sort()).toEqual(['A', 'B']);
	expect(stats.emitted).toBe(2);
	expect(stats.dropReasons['dup']).toBe(2); // one dup id + one dup barcode
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
