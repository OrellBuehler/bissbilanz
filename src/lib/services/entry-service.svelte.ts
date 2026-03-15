import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { enqueue } from '$lib/stores/offline-queue';
import { urlToMeta } from '$lib/utils/api';
import type { DexieFoodEntry } from '$lib/db/types';

function entriesByDate(date: string) {
	return liveQuery(() => db.foodEntries.where('date').equals(date).sortBy('createdAt'));
}

async function refresh(date: string) {
	const { data } = await api.GET('/api/entries', {
		params: { query: { date } }
	});
	if (!data?.entries) return;
	const entries = data.entries.map((e) => ({ ...e, date }));
	await db.foodEntries.where('date').equals(date).delete();
	await db.foodEntries.bulkPut(entries as DexieFoodEntry[]);
}

async function create(entry: {
	foodId?: string;
	recipeId?: string;
	mealType: string;
	servings: number;
	notes?: string | null;
	date: string;
	quickName?: string | null;
	quickCalories?: number | null;
	quickProtein?: number | null;
	quickCarbs?: number | null;
	quickFat?: number | null;
	quickFiber?: number | null;
	eatenAt?: string | null;
}) {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const foodId = entry.foodId ?? null;
	const recipeId = entry.recipeId ?? null;
	const servings = entry.servings ?? 1;

	let foodName: string | null = null;
	let calories: number | null = null;
	let protein: number | null = null;
	let carbs: number | null = null;
	let fat: number | null = null;
	let fiber: number | null = null;
	let servingSize: number | null = null;
	let servingUnit: string | null = null;

	if (foodId) {
		const food = await db.foods.get(foodId);
		if (food) {
			foodName = food.name;
			calories = food.calories * servings;
			protein = food.protein * servings;
			carbs = food.carbs * servings;
			fat = food.fat * servings;
			fiber = food.fiber * servings;
			servingSize = food.servingSize;
			servingUnit = food.servingUnit;
		}
	} else if (recipeId) {
		const recipe = await db.recipes.get(recipeId);
		if (recipe) {
			foodName = recipe.name;
			calories = (recipe.calories ?? 0) * servings;
			protein = (recipe.protein ?? 0) * servings;
			carbs = (recipe.carbs ?? 0) * servings;
			fat = (recipe.fat ?? 0) * servings;
			fiber = (recipe.fiber ?? 0) * servings;
		}
	}

	await db.foodEntries.put({
		id,
		foodId,
		recipeId,
		date: entry.date,
		mealType: entry.mealType,
		servings,
		notes: entry.notes ?? null,
		foodName,
		calories,
		protein,
		carbs,
		fat,
		fiber,
		servingSize,
		servingUnit,
		createdAt: now
	});

	if (navigator.onLine) {
		try {
			await api.POST('/api/entries', { body: entry });
			refresh(entry.date).catch(() => {});
		} catch {
			const url = '/api/entries';
			await enqueue('POST', url, entry, urlToMeta(url));
		}
	} else {
		const url = '/api/entries';
		await enqueue('POST', url, entry, urlToMeta(url));
	}
}

async function update(
	id: string,
	entry: {
		servings?: number;
		mealType?: string;
		notes?: string | null;
		date?: string;
		eatenAt?: string | null;
		quickName?: string | null;
		quickCalories?: number | null;
		quickProtein?: number | null;
		quickCarbs?: number | null;
		quickFat?: number | null;
		quickFiber?: number | null;
	}
) {
	const existing = await db.foodEntries.get(id);
	const date = entry.date ?? existing?.date ?? new Date().toISOString().slice(0, 10);

	await db.foodEntries.update(id, entry);

	if (navigator.onLine) {
		try {
			await api.PATCH('/api/entries/{id}', {
				params: { path: { id } },
				body: entry
			});
			refresh(date).catch(() => {});
		} catch {
			const url = `/api/entries/${id}`;
			await enqueue('PATCH', url, entry, urlToMeta(url));
		}
	} else {
		const url = `/api/entries/${id}`;
		await enqueue('PATCH', url, entry, urlToMeta(url));
	}
}

async function del(id: string) {
	const existing = await db.foodEntries.get(id);
	const date = existing?.date ?? new Date().toISOString().slice(0, 10);

	await db.foodEntries.delete(id);

	if (navigator.onLine) {
		try {
			await api.DELETE('/api/entries/{id}', {
				params: { path: { id } }
			});
			refresh(date).catch(() => {});
		} catch {
			const url = `/api/entries/${id}`;
			await enqueue('DELETE', url, {}, urlToMeta(url));
		}
	} else {
		const url = `/api/entries/${id}`;
		await enqueue('DELETE', url, {}, urlToMeta(url));
	}
}

async function copyEntries(fromDate: string, toDate: string) {
	await api.POST('/api/entries/copy', {
		params: { query: { fromDate, toDate } }
	});
	await refresh(toDate);
}

export const entryService = {
	entriesByDate,
	refresh,
	create,
	update,
	delete: del,
	copyEntries
};
