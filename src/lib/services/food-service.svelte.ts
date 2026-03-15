import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import type { DexieFood } from '$lib/db/types';
import { api } from '$lib/api/client';
import { enqueue } from '$lib/stores/offline-queue';
import type { paths } from '$lib/api/generated/schema';

type FoodCreate = paths['/api/foods']['post']['requestBody']['content']['application/json'];
type FoodUpdate = paths['/api/foods/{id}']['patch']['requestBody']['content']['application/json'];

function allFoods() {
	return liveQuery(() => db.foods.orderBy('name').toArray());
}

function foodById(id: string) {
	return liveQuery(() => db.foods.get(id));
}

function search(query: string) {
	return liveQuery(() =>
		db.foods.filter((f) => f.name.toLowerCase().includes(query.toLowerCase())).toArray()
	);
}

function favorites() {
	return liveQuery(() => db.foods.where('isFavorite').equals(1).toArray());
}

async function refresh() {
	try {
		const { data } = await api.GET('/api/foods');
		if (data) {
			await db.foods.bulkPut(data.foods as unknown as DexieFood[]);
			await db.syncMeta.put({ tableName: 'foods', lastSyncedAt: Date.now() });
		}
	} catch {
		// fire-and-forget
	}
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

	try {
		const { data } = await api.POST('/api/foods', { body: food });
		if (data) {
			await db.foods.put(data.food as unknown as DexieFood);
		}
	} catch {
		await enqueue('POST', '/api/foods', food, {
			affectedTable: 'foods',
			affectedId: id
		});
	}
}

async function update(id: string, food: FoodUpdate) {
	const now = new Date().toISOString();
	await db.foods.update(id, { ...food, updatedAt: now });

	try {
		const { data } = await api.PATCH('/api/foods/{id}', {
			params: { path: { id } },
			body: food
		});
		if (data) {
			await db.foods.put(data.food as unknown as DexieFood);
		}
	} catch {
		await enqueue('PATCH', `/api/foods/${id}`, food, {
			affectedTable: 'foods',
			affectedId: id
		});
	}
}

async function deleteFood(id: string) {
	await db.foods.delete(id);

	try {
		await api.DELETE('/api/foods/{id}', {
			params: { path: { id } }
		});
	} catch {
		await enqueue(
			'DELETE',
			`/api/foods/${id}`,
			{},
			{
				affectedTable: 'foods',
				affectedId: id
			}
		);
	}
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
	findByBarcode
};
