import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import type { DexieFood } from '$lib/db/types';
import { api } from '$lib/api/client';
import { isQueued } from '$lib/utils/api';
import { refreshTable, withOfflineFallback } from './base';
import type { paths } from '$lib/api/generated/schema';

type FoodCreate = paths['/api/foods']['post']['requestBody']['content']['application/json'];
type FoodUpdate = paths['/api/foods/{id}']['patch']['requestBody']['content']['application/json'];

// Supplement backing foods share the Dexie `foods` table but must not appear
// in user-facing food lists. Treat a missing `kind` field as regular food so
// pre-v4 cached rows still show up.
const isRegularFood = (f: DexieFood) => (f.kind ?? 'food') === 'food';

function allFoods() {
	return liveQuery(() => db.foods.orderBy('name').filter(isRegularFood).toArray());
}

function foodById(id: string) {
	return liveQuery(() => db.foods.get(id));
}

function search(query: string) {
	const q = query.toLowerCase();
	const matchesName = (f: DexieFood) => f.name.toLowerCase().includes(q);
	// Match name or brand, then rank name matches ahead of brand-only matches
	// (the sort is stable, so each group stays alphabetical from orderBy).
	return liveQuery(() =>
		db.foods
			.orderBy('name')
			.filter(
				(f) => isRegularFood(f) && (matchesName(f) || (f.brand ?? '').toLowerCase().includes(q))
			)
			.toArray()
			.then((rows) => rows.sort((a, b) => Number(matchesName(b)) - Number(matchesName(a))))
	);
}

function favorites() {
	return liveQuery(() => db.foods.filter((f) => isRegularFood(f) && f.isFavorite).toArray());
}

async function refresh() {
	// Only reconcile regular-food rows; supplement backing foods are
	// managed by the supplement service and must not be wiped here.
	await refreshTable<DexieFood>({
		table: db.foods,
		syncTableName: 'foods',
		fetchServer: async () => {
			const { data } = await api.GET('/api/foods');
			return (data?.foods as unknown as DexieFood[]) ?? null;
		},
		keepLocalRow: isRegularFood
	});
}

async function refreshById(id: string) {
	try {
		const { data } = await api.GET('/api/foods/{id}', {
			params: { path: { id } }
		});
		if (data) {
			await db.foods.put(data.food as unknown as DexieFood);
		}
	} catch {
		// fire-and-forget
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

	await withOfflineFallback(
		async () => {
			const { data, response } = await api.POST('/api/foods', { body: food });
			if (isQueued(response)) return;
			if (data) {
				await db.foods.put(data.food as unknown as DexieFood);
			}
		},
		{ method: 'POST', url: '/api/foods', body: food, affectedTable: 'foods', affectedId: id }
	);
}

async function update(id: string, food: FoodUpdate) {
	const now = new Date().toISOString();
	await db.foods.update(id, { ...food, updatedAt: now });

	await withOfflineFallback(
		async () => {
			const { data, response } = await api.PATCH('/api/foods/{id}', {
				params: { path: { id } },
				body: food
			});
			if (isQueued(response)) return;
			if (data) {
				await db.foods.put(data.food as unknown as DexieFood);
			}
		},
		{
			method: 'PATCH',
			url: `/api/foods/${id}`,
			body: food,
			affectedTable: 'foods',
			affectedId: id
		}
	);
}

async function deleteFood(id: string) {
	await db.foods.delete(id);

	await withOfflineFallback(
		async () => {
			await api.DELETE('/api/foods/{id}', {
				params: { path: { id } }
			});
		},
		{ method: 'DELETE', url: `/api/foods/${id}`, body: {}, affectedTable: 'foods', affectedId: id }
	);
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
	} catch {
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

export const foodService = {
	allFoods,
	foodById,
	search,
	favorites,
	refresh,
	refreshById,
	create,
	update,
	delete: deleteFood,
	findByBarcode,
	saveFromCatalog,
	saveFromOFF
};
