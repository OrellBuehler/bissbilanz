import { describe, expect, test, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/index';
import type { DexieFood } from '../../src/lib/db/types';
import {
	favoriteFoods,
	getFoodsByIds,
	regularFoodsPage,
	searchFoods
} from '../../src/lib/services/food-search';

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
		updatedAt: null,
		...overrides
	}) as DexieFood;

beforeEach(async () => {
	await db.foods.clear();
});

describe('searchFoods', () => {
	beforeEach(async () => {
		await db.foods.bulkPut([
			food({ id: 'a', name: 'Apfel' }),
			food({ id: 'b', name: 'Bratapfel' }),
			food({ id: 'c', name: 'apfelmus' }),
			food({ id: 'd', name: 'Vollkornbrot', labels: ['bread'], brand: 'Coop' }),
			food({ id: 'e', name: 'Aufstrich', brand: 'Bread & Co' }),
			food({ id: 'f', name: 'Cola', barcode: '7612345678901' }),
			food({ id: 's', name: 'Apfelessig Supplement', kind: 'supplement' })
		]);
	});

	test('ranks name prefix, then name substring, then label, then brand', async () => {
		const byName = await searchFoods('apfel');
		expect(byName.map((r) => r.id)).toEqual(['a', 'c', 'b']);
		const byLabel = await searchFoods('bread');
		expect(byLabel.map((r) => r.id)).toEqual(['d', 'e']);
	});

	test('matches case-insensitively and never returns supplement backing foods', async () => {
		const rows = await searchFoods('APFEL');
		expect(rows.some((r) => r.id === 's')).toBe(false);
		expect(rows).toHaveLength(3);
	});

	test('an empty query lists foods by name, capped at the limit', async () => {
		const rows = await searchFoods('', { limit: 3 });
		expect(rows.map((r) => r.id)).toEqual(['a', 'e', 'b']);
	});

	test('finds a barcode prefix only when asked to', async () => {
		expect(await searchFoods('76123')).toEqual([]);
		expect((await searchFoods('76123', { barcode: true })).map((r) => r.id)).toEqual(['f']);
	});

	test('does not list a food twice when several tiers match it', async () => {
		await db.foods.put(
			food({ id: 'g', name: 'Brotaufstrich', brand: 'Brot AG', labels: ['brot'] })
		);
		const rows = await searchFoods('brot');
		expect(rows.map((r) => r.id).filter((id) => id === 'g')).toHaveLength(1);
	});
});

describe('regularFoodsPage', () => {
	test('pages regular foods by name and counts them without supplements', async () => {
		await db.foods.bulkPut([
			food({ id: '1', name: 'Anis' }),
			food({ id: '2', name: 'Birne' }),
			food({ id: '3', name: 'Dattel' }),
			food({ id: 's', name: 'Cassis', kind: 'supplement' })
		]);
		const first = await regularFoodsPage(1, 2);
		expect(first.foods.map((r) => r.id)).toEqual(['1', '2']);
		expect(first.total).toBe(3);
		const second = await regularFoodsPage(2, 2);
		expect(second.foods.map((r) => r.id)).toEqual(['3']);
	});
});

describe('favorites index', () => {
	test('favKey follows isFavorite through put, update and modify', async () => {
		await db.foods.bulkPut([
			food({ id: '1', name: 'Anis', isFavorite: true }),
			food({ id: '2', name: 'Birne' }),
			food({ id: 's', name: 'Cassis', kind: 'supplement', isFavorite: true })
		]);
		expect((await favoriteFoods()).map((r) => r.id)).toEqual(['1']);

		await db.foods.update('2', { isFavorite: true });
		expect((await favoriteFoods()).map((r) => r.id)).toEqual(['1', '2']);

		await db.foods.where('id').anyOf(['1']).modify({ isFavorite: false });
		expect((await favoriteFoods()).map((r) => r.id)).toEqual(['2']);

		await db.foods.put(food({ id: '2', name: 'Birne', isFavorite: true, calories: 50 }));
		expect((await favoriteFoods()).map((r) => r.id)).toEqual(['2']);
		expect((await db.foods.get('2'))?.favKey).toBe(1);

		await db.foods.put(food({ id: '2', name: 'Birne', isFavorite: false }));
		expect(await favoriteFoods()).toEqual([]);
		expect((await db.foods.get('2'))?.favKey).toBeUndefined();
	});

	test('a row stored without kind is treated as a regular food', async () => {
		await db.foods.put({ ...food({ id: 'x', name: 'Alt' }), kind: undefined } as never);
		expect((await db.foods.get('x'))?.kind).toBe('food');
		expect((await regularFoodsPage(1, 10)).total).toBe(1);
	});
});

describe('getFoodsByIds', () => {
	test('returns only existing regular foods', async () => {
		await db.foods.bulkPut([
			food({ id: '1', name: 'Anis' }),
			food({ id: 's', name: 'Cassis', kind: 'supplement' })
		]);
		const rows = await getFoodsByIds(['1', 's', 'missing']);
		expect(rows.map((r) => r.id)).toEqual(['1']);
	});
});

// Straight into IndexedDB in one transaction: the foods hooks would make seeding
// 100k rows through Dexie take minutes, and the hooks are not what is measured here.
const seedRaw = async (rows: DexieFood[]) => {
	await db.open();
	const tx = db.backendDB().transaction('foods', 'readwrite');
	const store = tx.objectStore('foods');
	for (const row of rows) store.put(row);
	await new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
};

describe('a 100k-food mirror', () => {
	test('searches and pages without reading the table', async () => {
		const syllables = ['ka', 'mo', 'ri', 'tu', 'be', 'so', 'la', 'ni'];
		const rows: DexieFood[] = [];
		for (let i = 0; i < 100_000; i++) {
			const name = `${syllables[i % 8]}${syllables[(i >> 3) % 8]}${syllables[(i >> 6) % 8]}${i}`;
			rows.push(food({ id: `id-${i}`, name, brand: i % 50 === 0 ? 'Marke' : null }));
		}
		await seedRaw(rows);

		let start = performance.now();
		const prefix = await searchFoods('kamo');
		const prefixMs = performance.now() - start;
		expect(prefix).toHaveLength(50);
		expect(prefix.every((r) => r.name.startsWith('kamo'))).toBe(true);

		start = performance.now();
		const substring = await searchFoods('ri9');
		const substringMs = performance.now() - start;
		expect(substring).toHaveLength(50);
		expect(substring.every((r) => r.name.includes('ri9'))).toBe(true);

		start = performance.now();
		const brandOnly = await searchFoods('marke');
		const brandMs = performance.now() - start;
		expect(brandOnly).toHaveLength(50);

		start = performance.now();
		const miss = await searchFoods('zzzz');
		const missMs = performance.now() - start;
		expect(miss).toEqual([]);

		start = performance.now();
		const page = await regularFoodsPage(3, 50);
		const pageMs = performance.now() - start;
		expect(page.foods).toHaveLength(50);
		expect(page.total).toBe(100_000);

		expect(prefixMs).toBeLessThan(10_000);
		expect(substringMs).toBeLessThan(10_000);
		expect(brandMs).toBeLessThan(10_000);
		expect(missMs).toBeLessThan(20_000);
		expect(pageMs).toBeLessThan(10_000);
	}, 120_000);
});
