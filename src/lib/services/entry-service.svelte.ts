import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { withOfflineFallback } from './base';
import type { DexieFoodEntry } from '$lib/db/types';

function entriesByDate(date: string) {
	return liveQuery(() => db.foodEntries.where('date').equals(date).sortBy('createdAt'));
}

async function refresh(date: string) {
	try {
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
	} catch {
		// background cache refresh — leave stale cache on failure
	}
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
	eatenAt?: string;
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

	// Macros are stored PER-SERVING to match the server (`/api/entries` returns
	// per-serving values and `calculateEntryMacros` multiplies by `servings`).
	// Storing pre-multiplied values here caused a value × servings² display bug.
	if (foodId) {
		const food = await db.foods.get(foodId);
		if (food) {
			foodName = food.name;
			calories = food.calories;
			protein = food.protein;
			carbs = food.carbs;
			fat = food.fat;
			fiber = food.fiber;
			servingSize = food.servingSize;
			servingUnit = food.servingUnit;
		}
	} else if (recipeId) {
		const recipe = await db.recipes.get(recipeId);
		if (recipe) {
			// Cached recipe macros are whole-recipe totals; the server entry
			// endpoint returns them divided by totalServings (per serving).
			const perServing = recipe.totalServings ? 1 / recipe.totalServings : 1;
			foodName = recipe.name;
			calories = (recipe.calories ?? 0) * perServing;
			protein = (recipe.protein ?? 0) * perServing;
			carbs = (recipe.carbs ?? 0) * perServing;
			fat = (recipe.fat ?? 0) * perServing;
			fiber = (recipe.fiber ?? 0) * perServing;
		}
	} else if (entry.quickName) {
		foodName = entry.quickName;
		calories = entry.quickCalories ?? 0;
		protein = entry.quickProtein ?? 0;
		carbs = entry.quickCarbs ?? 0;
		fat = entry.quickFat ?? 0;
		fiber = entry.quickFiber ?? 0;
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

	await withOfflineFallback(() => api.POST('/api/entries', { body: entry }), {
		onSuccess: () => {
			refresh(entry.date).catch(() => {});
		},
		method: 'POST',
		url: '/api/entries',
		body: entry,
		affectedTable: 'foodEntries'
	});
}

async function update(
	id: string,
	entry: {
		servings?: number;
		mealType?: string;
		notes?: string | null;
		date?: string;
		eatenAt?: string;
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

	// Macros are stored per-serving, so changing `servings` alone doesn't change
	// them (consumers multiply by `servings`). Only a quick-entry macro edit
	// rewrites the stored per-serving values.
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
		if (entry.quickCalories !== undefined) dexieUpdate.calories = entry.quickCalories ?? 0;
		if (entry.quickProtein !== undefined) dexieUpdate.protein = entry.quickProtein ?? 0;
		if (entry.quickCarbs !== undefined) dexieUpdate.carbs = entry.quickCarbs ?? 0;
		if (entry.quickFat !== undefined) dexieUpdate.fat = entry.quickFat ?? 0;
		if (entry.quickFiber !== undefined) dexieUpdate.fiber = entry.quickFiber ?? 0;
		if (entry.quickName !== undefined) dexieUpdate.foodName = entry.quickName;
	}

	delete dexieUpdate.quickName;
	delete dexieUpdate.quickCalories;
	delete dexieUpdate.quickProtein;
	delete dexieUpdate.quickCarbs;
	delete dexieUpdate.quickFat;
	delete dexieUpdate.quickFiber;

	await db.foodEntries.update(id, dexieUpdate);

	await withOfflineFallback(
		() =>
			api.PATCH('/api/entries/{id}', {
				params: { path: { id } },
				body: entry
			}),
		{
			onSuccess: () => {
				refresh(date).catch(() => {});
			},
			method: 'PATCH',
			url: `/api/entries/${id}`,
			body: entry,
			affectedTable: 'foodEntries',
			affectedId: id
		}
	);
}

async function del(id: string) {
	const existing = await db.foodEntries.get(id);
	const date = existing?.date ?? new Date().toISOString().slice(0, 10);

	await db.foodEntries.delete(id);

	await withOfflineFallback(
		() =>
			api.DELETE('/api/entries/{id}', {
				params: { path: { id } }
			}),
		{
			onSuccess: () => {
				refresh(date).catch(() => {});
			},
			method: 'DELETE',
			url: `/api/entries/${id}`,
			body: {},
			affectedTable: 'foodEntries',
			affectedId: id
		}
	);
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
