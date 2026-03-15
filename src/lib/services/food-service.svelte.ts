import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import type { DexieFood } from '$lib/db/types';
import { api } from '$lib/api/client';
import { enqueue } from '$lib/stores/offline-queue';

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

async function create(food: Record<string, unknown>) {
	const now = new Date().toISOString();
	const id = (food.id as string) ?? crypto.randomUUID();
	const n = (k: string) => (food[k] as number) ?? null;

	const dexieFood: DexieFood = {
		id,
		userId: '',
		name: (food.name as string) ?? '',
		brand: (food.brand as string) ?? null,
		servingSize: (food.servingSize as number) ?? 100,
		servingUnit: (food.servingUnit as string) ?? 'g',
		calories: (food.calories as number) ?? 0,
		protein: (food.protein as number) ?? 0,
		carbs: (food.carbs as number) ?? 0,
		fat: (food.fat as number) ?? 0,
		fiber: (food.fiber as number) ?? 0,
		saturatedFat: n('saturatedFat'),
		monounsaturatedFat: n('monounsaturatedFat'),
		polyunsaturatedFat: n('polyunsaturatedFat'),
		transFat: n('transFat'),
		cholesterol: n('cholesterol'),
		omega3: n('omega3'),
		omega6: n('omega6'),
		sugar: n('sugar'),
		addedSugars: n('addedSugars'),
		sugarAlcohols: n('sugarAlcohols'),
		starch: n('starch'),
		sodium: n('sodium'),
		potassium: n('potassium'),
		calcium: n('calcium'),
		iron: n('iron'),
		magnesium: n('magnesium'),
		phosphorus: n('phosphorus'),
		zinc: n('zinc'),
		copper: n('copper'),
		manganese: n('manganese'),
		selenium: n('selenium'),
		iodine: n('iodine'),
		fluoride: n('fluoride'),
		chromium: n('chromium'),
		molybdenum: n('molybdenum'),
		chloride: n('chloride'),
		vitaminA: n('vitaminA'),
		vitaminC: n('vitaminC'),
		vitaminD: n('vitaminD'),
		vitaminE: n('vitaminE'),
		vitaminK: n('vitaminK'),
		vitaminB1: n('vitaminB1'),
		vitaminB2: n('vitaminB2'),
		vitaminB3: n('vitaminB3'),
		vitaminB5: n('vitaminB5'),
		vitaminB6: n('vitaminB6'),
		vitaminB7: n('vitaminB7'),
		vitaminB9: n('vitaminB9'),
		vitaminB12: n('vitaminB12'),
		caffeine: n('caffeine'),
		alcohol: n('alcohol'),
		water: n('water'),
		salt: n('salt'),
		barcode: (food.barcode as string) ?? null,
		isFavorite: (food.isFavorite as boolean) ?? false,
		nutriScore: (food.nutriScore as string) ?? null,
		novaGroup: (food.novaGroup as number) ?? null,
		additives: (food.additives as string[]) ?? null,
		ingredientsText: (food.ingredientsText as string) ?? null,
		imageUrl: (food.imageUrl as string) ?? null,
		createdAt: now,
		updatedAt: now
	};

	await db.foods.put(dexieFood);

	try {
		const { data } = await api.POST('/api/foods', { body: food as never });
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

async function update(id: string, food: Record<string, unknown>) {
	const now = new Date().toISOString();
	await db.foods.update(id, { ...food, updatedAt: now });

	try {
		const { data } = await api.PATCH('/api/foods/{id}', {
			params: { path: { id } },
			body: food as never
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
