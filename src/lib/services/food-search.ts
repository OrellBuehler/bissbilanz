import Dexie from 'dexie';
import { db } from '$lib/db';
import type { DexieFood } from '$lib/db/types';
import { normalizeLabel } from '$lib/labels';

export const SEARCH_LIMIT = 50;

// Supplement backing foods share the table but the name index cannot tell them
// apart, so key scans over-collect by this margin before they are dropped.
const SUPPLEMENT_MARGIN = 20;

export const isRegularFood = (f: DexieFood) => (f.kind ?? 'food') === 'food';

const regularRange = () =>
	db.foods.where('[kind+name]').between(['food', Dexie.minKey], ['food', Dexie.maxKey]);

export const regularFoodsPage = async (page: number, perPage: number) => {
	const [foods, total] = await Promise.all([
		regularRange()
			.offset((page - 1) * perPage)
			.limit(perPage)
			.toArray(),
		regularRange().count()
	]);
	return { foods, total };
};

export const favoriteFoods = async () => {
	const rows = await db.foods.where('favKey').equals(1).toArray();
	return rows.filter(isRegularFood).sort((a, b) => a.name.localeCompare(b.name));
};

export const getFoodsByIds = async (ids: string[]) => {
	const rows = await db.foods.bulkGet(ids);
	return rows.filter((row): row is DexieFood => row !== undefined && isRegularFood(row));
};

/**
 * Local food search that never loads the table. Tiers mirror the server's
 * ranking: name prefix (an index range), name substring (a key-only scan that
 * stops once enough ids are found), then label (multi-entry index), then brand
 * (key-only scan), and optionally barcode prefix. Rows are only read for the
 * final `limit` ids.
 */
export const searchFoods = async (
	query: string,
	options: { limit?: number; barcode?: boolean } = {}
): Promise<DexieFood[]> => {
	const limit = options.limit ?? SEARCH_LIMIT;
	const q = query.trim().toLowerCase();
	if (!q) return regularRange().limit(limit).toArray();

	const want = limit + SUPPLEMENT_MARGIN;
	const ids: string[] = [];
	const seen = new Set<string>();
	const add = (id: string) => {
		if (seen.has(id)) return;
		seen.add(id);
		ids.push(id);
	};

	for (const id of await db.foods.where('name').startsWithIgnoreCase(q).limit(want).primaryKeys()) {
		add(id as string);
	}

	if (ids.length < want) {
		await db.foods
			.orderBy('name')
			.until(() => ids.length >= want)
			.eachKey((key, cursor) => {
				if (String(key).toLowerCase().includes(q)) add(cursor.primaryKey as string);
			});
	}

	const label = normalizeLabel(q);
	if (label && ids.length < want) {
		const labelled = await db.foods.where('labels').equals(label).limit(want).toArray();
		for (const food of labelled.sort((a, b) => a.name.localeCompare(b.name))) add(food.id);
	}

	if (ids.length < want) {
		await db.foods
			.orderBy('brand')
			.until(() => ids.length >= want)
			.eachKey((key, cursor) => {
				if (String(key).toLowerCase().includes(q)) add(cursor.primaryKey as string);
			});
	}

	if (options.barcode && ids.length < want) {
		for (const id of await db.foods.where('barcode').startsWith(q).limit(want).primaryKeys()) {
			add(id as string);
		}
	}

	const rows = await db.foods.bulkGet(ids);
	return rows
		.filter((row): row is DexieFood => row !== undefined && isRegularFood(row))
		.slice(0, limit);
};
