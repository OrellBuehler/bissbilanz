import { liveQuery } from 'dexie';
import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import type { DexieFood } from '$lib/db/types';
import { api } from '$lib/api/client';
import { withOfflineFallback } from './base';
import { refreshFoodsDelta } from './food-delta';
import { favoriteFoods, getFoodsByIds, regularFoodsPage, searchFoods } from './food-search';
import { normalizeLabels } from '$lib/labels';
import { pickNonNullNutrients } from '$lib/nutrients';
import type { paths } from '$lib/api/generated/schema';

type FoodCreate = paths['/api/foods']['post']['requestBody']['content']['application/json'];
type FoodBatchBody =
	paths['/api/foods/batch']['post']['requestBody']['content']['application/json'];
type FoodBatchResult =
	paths['/api/foods/batch']['post']['responses']['200']['content']['application/json'];
type FoodImportResult =
	paths['/api/foods/import']['post']['responses']['201']['content']['application/json'];
type FoodUpdate = paths['/api/foods/{id}']['patch']['requestBody']['content']['application/json'];

function allFoodsPage(page: number, perPage: number) {
	return liveQuery(() => regularFoodsPage(page, perPage));
}

function foodById(id: string) {
	return liveQuery(() => db.foods.get(id));
}

function search(query: string, options: { limit?: number; barcode?: boolean } = {}) {
	// Name, then label, then brand — the same tiers as the server's search, so
	// "bread" finds "Vollkornbrot" offline too once it is labelled. Bounded by
	// `options.limit`: an account can hold 100k foods and a search must not read them all.
	return liveQuery(() => searchFoods(query, options));
}

function favorites() {
	return liveQuery(() => favoriteFoods());
}

function foodsByIds(ids: string[]) {
	return liveQuery(() => getFoodsByIds(ids));
}

let running: Promise<void> | null = null;
let rerun = false;

/**
 * Bring the foods mirror up to date from the server's delta feed instead of
 * re-downloading the table. Overlapping calls are coalesced; a call made while
 * one is running triggers exactly one more pass so it never gets a stale result.
 */
function refresh() {
	if (running) {
		rerun = true;
		return running;
	}
	running = (async () => {
		do {
			rerun = false;
			await refreshFoodsDelta();
		} while (rerun);
	})().finally(() => {
		running = null;
	});
	return running;
}

/** Drop rows from the mirror that were just deleted on the server. */
async function removeLocal(ids: string[]) {
	await db.foods.bulkDelete(ids);
}

async function refreshById(id: string) {
	try {
		const { data } = await api.GET('/api/foods/{id}', {
			params: { path: { id } }
		});
		if (data) {
			await db.foods.put(data.food as unknown as DexieFood);
		}
	} catch (err) {
		// fire-and-forget
		if (!(browser && !navigator.onLine)) {
			Sentry.captureException(err, { extra: { context: 'food-service.refreshById' } });
		}
	}
}

async function create(food: FoodCreate) {
	const now = new Date().toISOString();
	const id = crypto.randomUUID();

	const dexieFood: DexieFood = {
		id,
		userId: '',
		name: food.name,
		brand: food.brand ?? null,
		kind: 'food',
		servingSize: food.servingSize,
		servingUnit: food.servingUnit,
		calories: food.calories,
		protein: food.protein,
		carbs: food.carbs,
		fat: food.fat,
		fiber: food.fiber,
		saturatedFat: food.saturatedFat ?? null,
		monounsaturatedFat: food.monounsaturatedFat ?? null,
		polyunsaturatedFat: food.polyunsaturatedFat ?? null,
		transFat: food.transFat ?? null,
		cholesterol: food.cholesterol ?? null,
		omega3: food.omega3 ?? null,
		omega6: food.omega6 ?? null,
		sugar: food.sugar ?? null,
		addedSugars: food.addedSugars ?? null,
		sugarAlcohols: food.sugarAlcohols ?? null,
		starch: food.starch ?? null,
		sodium: food.sodium ?? null,
		potassium: food.potassium ?? null,
		calcium: food.calcium ?? null,
		iron: food.iron ?? null,
		magnesium: food.magnesium ?? null,
		phosphorus: food.phosphorus ?? null,
		zinc: food.zinc ?? null,
		copper: food.copper ?? null,
		manganese: food.manganese ?? null,
		selenium: food.selenium ?? null,
		iodine: food.iodine ?? null,
		fluoride: food.fluoride ?? null,
		chromium: food.chromium ?? null,
		molybdenum: food.molybdenum ?? null,
		chloride: food.chloride ?? null,
		vitaminA: food.vitaminA ?? null,
		vitaminC: food.vitaminC ?? null,
		vitaminD: food.vitaminD ?? null,
		vitaminE: food.vitaminE ?? null,
		vitaminK: food.vitaminK ?? null,
		vitaminB1: food.vitaminB1 ?? null,
		vitaminB2: food.vitaminB2 ?? null,
		vitaminB3: food.vitaminB3 ?? null,
		vitaminB5: food.vitaminB5 ?? null,
		vitaminB6: food.vitaminB6 ?? null,
		vitaminB7: food.vitaminB7 ?? null,
		vitaminB9: food.vitaminB9 ?? null,
		vitaminB12: food.vitaminB12 ?? null,
		caffeine: food.caffeine ?? null,
		alcohol: food.alcohol ?? null,
		water: food.water ?? null,
		salt: food.salt ?? null,
		barcode: food.barcode ?? null,
		isFavorite: food.isFavorite ?? false,
		nutriScore: food.nutriScore ?? null,
		novaGroup: food.novaGroup ?? null,
		additives: food.additives ?? null,
		ingredientsText: food.ingredientsText ?? null,
		imageUrl: food.imageUrl ?? null,
		createdAt: now,
		updatedAt: now
	};

	await db.foods.put(dexieFood);

	await withOfflineFallback(() => api.POST('/api/foods', { body: food }), {
		onSuccess: async (data) => {
			await db.foods.put(data.food as unknown as DexieFood);
		},
		method: 'POST',
		url: '/api/foods',
		body: food,
		affectedTable: 'foods',
		affectedId: id
	});
}

async function update(id: string, food: FoodUpdate) {
	const now = new Date().toISOString();
	await db.foods.update(id, { ...food, updatedAt: now });

	await withOfflineFallback(
		() =>
			api.PATCH('/api/foods/{id}', {
				params: { path: { id } },
				body: food
			}),
		{
			onSuccess: async (data) => {
				await db.foods.put(data.food as unknown as DexieFood);
			},
			method: 'PATCH',
			url: `/api/foods/${id}`,
			body: food,
			affectedTable: 'foods',
			affectedId: id
		}
	);
}

/**
 * Replace the food's labels. Optimistic like every other edit: the Dexie row is
 * updated first (so search picks the new labels up immediately), then the write
 * goes to the server or into the offline queue with the same idempotency and
 * last-write-wins stamps as a food edit. Returns the labels the server could
 * not fit under the per-food cap, empty when the write was queued.
 */
async function setLabels(id: string, labels: string[]): Promise<string[]> {
	const normalized = normalizeLabels(labels).sort();
	await db.foods.update(id, { labels: normalized, updatedAt: new Date().toISOString() });

	let dropped: string[] = [];
	await withOfflineFallback(
		() =>
			api.PUT('/api/foods/{id}/labels', {
				params: { path: { id } },
				body: { labels }
			}),
		{
			onSuccess: async (data) => {
				await db.foods.update(id, { labels: data.labels });
				dropped = data.dropped;
			},
			method: 'PUT',
			url: `/api/foods/${id}/labels`,
			body: { labels },
			affectedTable: 'foods',
			affectedId: id
		}
	);
	return dropped;
}

async function deleteFood(id: string) {
	await db.foods.delete(id);

	await withOfflineFallback(
		() =>
			api.DELETE('/api/foods/{id}', {
				params: { path: { id } }
			}),
		{ method: 'DELETE', url: `/api/foods/${id}`, body: {}, affectedTable: 'foods', affectedId: id }
	);
}

/**
 * Apply one action to many foods in a single request. Online-only, like the
 * merge tool: a bulk write is a deliberate desk-side cleanup, and queueing it
 * offline would replay against a mirror the server has since moved past.
 * The Dexie rows are reconciled from the server once the write lands.
 */
async function batch(body: FoodBatchBody): Promise<FoodBatchResult | null> {
	const { data, error } = await api.POST('/api/foods/batch', { body });
	if (error || !data) return null;

	const applied = data.results.filter((result) => result.ok).map((result) => result.id);
	if (applied.length > 0) {
		if (body.action === 'delete') {
			await db.foods.bulkDelete(applied);
		} else if (body.action === 'favorite' || body.action === 'unfavorite') {
			const isFavorite = body.action === 'favorite';
			await db.foods.where('id').anyOf(applied).modify({ isFavorite });
		}
	}
	// Labels are normalized and capped server-side, so the mirror takes them
	// from the refresh rather than guessing what was stored.
	await refresh();
	return data;
}

/** The server caps one import request at this many foods. */
const IMPORT_CHUNK_SIZE = 500;

/**
 * Create many foods at once and put the server's rows into the mirror. Larger
 * lists go up in chunks of the server's per-request cap; the results are merged
 * so the caller sees one outcome. A chunk that fails after earlier ones landed
 * still reports what was created so far.
 */
async function importFoods(foods: FoodCreate[]): Promise<FoodImportResult | null> {
	const merged: FoodImportResult = { foods: [], created: 0, skipped: [] };
	for (let offset = 0; offset < foods.length; offset += IMPORT_CHUNK_SIZE) {
		const chunk = foods.slice(offset, offset + IMPORT_CHUNK_SIZE);
		const { data, error } = await api.POST('/api/foods/import', { body: { foods: chunk } });
		if (error || !data) return merged.created > 0 ? merged : null;
		await db.foods.bulkPut(data.foods as unknown as DexieFood[]);
		merged.foods.push(...data.foods);
		merged.created += data.created;
		merged.skipped.push(...data.skipped.map((s) => ({ ...s, index: s.index + offset })));
	}
	return merged;
}

async function findByBarcode(barcode: string): Promise<DexieFood | null> {
	try {
		const { data } = await api.GET('/api/foods', {
			params: { query: { barcode } }
		});
		if (data && data.foods.length > 0) {
			const food = data.foods[0] as unknown as DexieFood;
			await db.foods.put(food);
			return food;
		}
		return null;
	} catch (err) {
		if (!(browser && !navigator.onLine)) {
			Sentry.captureException(err, { extra: { context: 'food-service.findByBarcode' } });
		}
		const cached = await db.foods.where('barcode').equals(barcode).first();
		return cached ?? null;
	}
}

async function saveFromCatalog(catalogId: string): Promise<DexieFood | null> {
	const { data } = await api.POST('/api/catalog/{id}/save', {
		params: { path: { id: catalogId } }
	});
	if (!data?.food) return null;
	const food = data.food as unknown as DexieFood;
	await db.foods.put(food);
	return food;
}

async function saveFromOFF(barcode: string): Promise<DexieFood | null> {
	const { data } = await api.POST('/api/openfoodfacts/{barcode}/save', {
		params: { path: { barcode } }
	});
	if (!data?.food) return null;
	const food = data.food as unknown as DexieFood;
	await db.foods.put(food);
	return food;
}

/**
 * Online-only calls for the foods page. They hand back the raw API result so the
 * caller can react to specific error codes (duplicate barcode, in-use conflict)
 * and they leave the Dexie mirror to the caller's refresh.
 */
function duplicates() {
	return api.GET('/api/foods/duplicates');
}

function fetchById(id: string) {
	return api.GET('/api/foods/{id}', { params: { path: { id } } });
}

function createOnline(body: FoodCreate) {
	return api.POST('/api/foods', { body });
}

function updateOnline(id: string, body: FoodUpdate) {
	return api.PATCH('/api/foods/{id}', { params: { path: { id } }, body });
}

function deleteOnline(id: string, force = false) {
	return api.DELETE('/api/foods/{id}', {
		params: force ? { path: { id }, query: { force: true } } : { path: { id } }
	});
}

function fetchOffProduct(barcode: string) {
	return api.GET('/api/openfoodfacts/{barcode}', { params: { path: { barcode } } });
}

function searchOff(q: string) {
	return api.GET('/api/openfoodfacts/search', { params: { query: { q } } });
}

async function enrichFromOff(id: string, barcode: string) {
	const { data, error } = await fetchOffProduct(barcode);
	if (error || !data) return;
	const { product } = data;
	await updateOnline(id, {
		nutriScore: product.nutriScore,
		novaGroup: product.novaGroup,
		additives: product.additives,
		ingredientsText: product.ingredientsText,
		imageUrl: product.imageUrl,
		...pickNonNullNutrients(product)
	});
	await refreshById(id);
}

export const foodService = {
	allFoodsPage,
	foodById,
	foodsByIds,
	getFoodsByIds,
	searchFoods,
	search,
	favorites,
	refresh,
	removeLocal,
	refreshById,
	create,
	update,
	setLabels,
	batch,
	importFoods,
	delete: deleteFood,
	findByBarcode,
	saveFromCatalog,
	saveFromOFF,
	duplicates,
	fetchById,
	createOnline,
	updateOnline,
	deleteOnline,
	fetchOffProduct,
	searchOff,
	enrichFromOff
};
