import { describe, expect, test, vi, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/index';
import type { DexieFood } from '../../src/lib/db/types';

let favorites: { foods: { id: string }[]; recipes: { id: string }[] } = { foods: [], recipes: [] };

vi.mock('$lib/api/client', () => ({
	api: { GET: async () => ({ data: favorites }) }
}));

const { favoritesService } = await import('../../src/lib/services/favorites-service.svelte');

const food = (id: string, isFavorite: boolean) =>
	({
		id,
		userId: 'u',
		name: `Food ${id}`,
		brand: null,
		kind: 'food',
		isFavorite
	}) as unknown as DexieFood;

const favoriteIds = async () =>
	(await db.foods.where('favKey').equals(1).primaryKeys()).map(String).sort();

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('favoritesService.refresh', () => {
	test('flips only the foods whose favourite flag differs from the server', async () => {
		await db.foods.bulkPut([food('keep', true), food('drop', true), food('add', false)]);
		favorites = { foods: [{ id: 'keep' }, { id: 'add' }, { id: 'unknown' }], recipes: [] };

		await favoritesService.refresh();

		expect(await favoriteIds()).toEqual(['add', 'keep']);
		expect((await db.foods.get('drop'))?.isFavorite).toBe(false);
		expect((await db.foods.get('add'))?.isFavorite).toBe(true);
		expect(await db.foods.get('unknown')).toBeUndefined();
	});

	test('replaces the recipe favourites', async () => {
		await db.recipes.bulkPut([
			{ id: 'r1', isFavorite: true },
			{ id: 'r2', isFavorite: false }
		] as never[]);
		favorites = { foods: [], recipes: [{ id: 'r2' }] };

		await favoritesService.refresh();

		expect((await db.recipes.get('r1'))?.isFavorite).toBe(false);
		expect((await db.recipes.get('r2'))?.isFavorite).toBe(true);
	});
});
