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
	await db.transaction('rw', db.foodEntries, async () => {
		const serverIds = new Set(entries.map((e) => e.id));
		const existing = await db.foodEntries.where('date').equals(date).toArray();
		const toDelete = existing.filter((e) => !serverIds.has(e.id) && !e.id.startsWith('temp_'));
		if (toDelete.length > 0) {
			await db.foodEntries.bulkDelete(toDelete.map((e) => e.id));
		}
		await db.foodEntries.bulkPut(entries as DexieFoodEntry[]);
	});
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
	} else if (entry.quickName) {
		foodName = entry.quickName;
		calories = (entry.quickCalories ?? 0) * servings;
		protein = (entry.quickProtein ?? 0) * servings;
		carbs = (entry.quickCarbs ?? 0) * servings;
		fat = (entry.quickFat ?? 0) * servings;
		fiber = (entry.quickFiber ?? 0) * servings;
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

	const dexieUpdate: Record<string, unknown> = { ...entry };

	if (existing && entry.servings != null && entry.servings !== existing.servings) {
		const servings = entry.servings;
		if (existing.foodId) {
			const food = await db.foods.get(existing.foodId);
			if (food) {
				dexieUpdate.calories = food.calories * servings;
				dexieUpdate.protein = food.protein * servings;
				dexieUpdate.carbs = food.carbs * servings;
				dexieUpdate.fat = food.fat * servings;
				dexieUpdate.fiber = food.fiber * servings;
			}
		} else if (existing.recipeId) {
			const recipe = await db.recipes.get(existing.recipeId);
			if (recipe) {
				dexieUpdate.calories = (recipe.calories ?? 0) * servings;
				dexieUpdate.protein = (recipe.protein ?? 0) * servings;
				dexieUpdate.carbs = (recipe.carbs ?? 0) * servings;
				dexieUpdate.fat = (recipe.fat ?? 0) * servings;
				dexieUpdate.fiber = (recipe.fiber ?? 0) * servings;
			}
		} else if (existing.calories != null) {
			const oldServings = existing.servings || 1;
			const perServing = (val: number | null) =>
				val != null ? (val / oldServings) * servings : null;
			dexieUpdate.calories = perServing(existing.calories);
			dexieUpdate.protein = perServing(existing.protein);
			dexieUpdate.carbs = perServing(existing.carbs);
			dexieUpdate.fat = perServing(existing.fat);
			dexieUpdate.fiber = perServing(existing.fiber);
		}
	}

	if (
		existing &&
		!existing.foodId &&
		!existing.recipeId &&
		(entry.quickCalories !== undefined ||
			entry.quickProtein !== undefined ||
			entry.quickCarbs !== undefined ||
			entry.quickFat !== undefined ||
			entry.quickFiber !== undefined ||
			entry.quickName !== undefined)
	) {
		const servings = entry.servings ?? existing.servings ?? 1;
		if (entry.quickCalories !== undefined)
			dexieUpdate.calories = (entry.quickCalories ?? 0) * servings;
		if (entry.quickProtein !== undefined)
			dexieUpdate.protein = (entry.quickProtein ?? 0) * servings;
		if (entry.quickCarbs !== undefined) dexieUpdate.carbs = (entry.quickCarbs ?? 0) * servings;
		if (entry.quickFat !== undefined) dexieUpdate.fat = (entry.quickFat ?? 0) * servings;
		if (entry.quickFiber !== undefined) dexieUpdate.fiber = (entry.quickFiber ?? 0) * servings;
		if (entry.quickName !== undefined) dexieUpdate.foodName = entry.quickName;
	}

	delete dexieUpdate.quickName;
	delete dexieUpdate.quickCalories;
	delete dexieUpdate.quickProtein;
	delete dexieUpdate.quickCarbs;
	delete dexieUpdate.quickFat;
	delete dexieUpdate.quickFiber;

	await db.foodEntries.update(id, dexieUpdate);

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
