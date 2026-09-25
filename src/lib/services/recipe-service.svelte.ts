import { liveQuery } from 'dexie';
import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import type { DexieRecipe, DexieRecipeIngredient } from '$lib/db/types';
import { api } from '$lib/api/client';
import { enqueue } from '$lib/stores/offline-queue';
import { refreshTable, withOfflineFallback } from './base';

function allRecipes() {
	return liveQuery(() => db.recipes.orderBy('name').toArray());
}

function recipeById(id: string) {
	return liveQuery(async () => {
		const recipe = await db.recipes.get(id);
		if (!recipe) return undefined;
		const ingredients = await db.recipeIngredients.where('recipeId').equals(id).toArray();
		return { recipe, ingredients };
	});
}

async function refresh() {
	await refreshTable<DexieRecipe>({
		table: db.recipes,
		syncTableName: 'recipes',
		fetchServer: async () => {
			const { data } = await api.GET('/api/recipes');
			return (data?.recipes as unknown as DexieRecipe[]) ?? null;
		},
		extraTables: [db.recipeIngredients],
		cascadeDelete: async (staleIds) => {
			await db.recipeIngredients.where('recipeId').anyOf(staleIds).delete();
		}
	});
}

/**
 * Refreshes the cached copy and returns the full server response — including
 * fields (like extended nutrients) that aren't persisted to Dexie — so a
 * caller that's online can use them without a second request.
 */
async function refreshById(id: string) {
	try {
		const { data } = await api.GET('/api/recipes/{id}', {
			params: { path: { id } }
		});
		if (data) {
			await putRecipeWithIngredients(id, data.recipe);
			return data.recipe;
		}
	} catch (err) {
		// fire-and-forget
		if (!(browser && !navigator.onLine)) {
			Sentry.captureException(err, { extra: { context: 'recipe-service.refreshById' } });
		}
	}
	return null;
}

async function putRecipeWithIngredients(
	id: string,
	recipe: { ingredients?: unknown } & Record<string, unknown>
) {
	const { ingredients, ...recipeData } = recipe;
	await db.recipes.put(recipeData as unknown as DexieRecipe);
	if (Array.isArray(ingredients)) {
		await db.recipeIngredients.where('recipeId').equals(id).delete();
		await db.recipeIngredients.bulkPut(
			ingredients.map((ing) => ({
				id: ing.id ?? crypto.randomUUID(),
				recipeId: ing.recipeId ?? id,
				foodId: ing.foodId,
				quantity: ing.quantity,
				servingUnit: ing.servingUnit,
				sortOrder: ing.sortOrder
			}))
		);
	}
}

type MutationResult = { status: 'applied' } | { status: 'queued' } | { status: 'failed' };

async function create(recipe: Record<string, unknown>): Promise<MutationResult> {
	const now = new Date().toISOString();
	const id = (recipe.id as string) ?? crypto.randomUUID();

	const dexieRecipe: DexieRecipe = {
		id,
		userId: '',
		name: (recipe.name as string) ?? '',
		totalServings: (recipe.totalServings as number) ?? 1,
		isFavorite: false,
		imageUrl: null,
		cookedWeight: (recipe.cookedWeight as number | null | undefined) ?? null,
		calories: null,
		protein: null,
		carbs: null,
		fat: null,
		fiber: null,
		createdAt: now,
		updatedAt: now
	};

	await db.recipes.put(dexieRecipe);

	if (Array.isArray(recipe.ingredients)) {
		const items: DexieRecipeIngredient[] = (
			recipe.ingredients as Array<Partial<DexieRecipeIngredient>>
		).map((ing) => ({
			id: ing.id ?? crypto.randomUUID(),
			recipeId: id,
			foodId: ing.foodId ?? '',
			quantity: ing.quantity ?? 0,
			servingUnit: ing.servingUnit ?? 'g',
			sortOrder: ing.sortOrder ?? 0
		}));
		await db.recipeIngredients.bulkPut(items);
	}

	const result = await withOfflineFallback(
		() => api.POST('/api/recipes', { body: recipe as never }),
		{
			onSuccess: async (data) => {
				await putRecipeWithIngredients(id, data.recipe);
			},
			method: 'POST',
			url: '/api/recipes',
			body: recipe,
			affectedTable: 'recipes',
			affectedId: id
		}
	);
	if (result.status === 'error') return { status: 'failed' };
	return { status: result.status };
}

type DuplicateRecipeResult = { status: 'created' | 'queued'; id: string } | { status: 'failed' };

/**
 * Copies a recipe (ingredients, servings, cooked weight) under a new name,
 * not favorited, without its image (two recipes must never share one
 * `imageUrl` — deleting or changing either row's image would unlink the
 * file out from under the other, since `unlinkUpload` has no reference
 * count). Written against the offline-capable create path directly (rather
 * than delegating to `create()`) so the row can be reopened for editing
 * immediately afterward under one consistent id, online or off.
 */
async function duplicate(id: string, name: string): Promise<DuplicateRecipeResult> {
	const source = await db.recipes.get(id);
	if (!source) return { status: 'failed' };
	const sourceIngredients = await db.recipeIngredients
		.where('recipeId')
		.equals(id)
		.sortBy('sortOrder');

	const now = new Date().toISOString();
	const localId = crypto.randomUUID();
	const payload = {
		name,
		totalServings: source.totalServings,
		isFavorite: false,
		cookedWeight: source.cookedWeight,
		ingredients: sourceIngredients.map((i) => ({
			foodId: i.foodId,
			quantity: i.quantity,
			servingUnit: i.servingUnit
		}))
	};

	const dexieRecipe: DexieRecipe = {
		id: localId,
		userId: '',
		name,
		totalServings: source.totalServings,
		isFavorite: false,
		imageUrl: null,
		cookedWeight: source.cookedWeight,
		calories: source.calories,
		protein: source.protein,
		carbs: source.carbs,
		fat: source.fat,
		fiber: source.fiber,
		createdAt: now,
		updatedAt: now
	};
	await db.recipes.put(dexieRecipe);
	await db.recipeIngredients.bulkPut(
		sourceIngredients.map((i): DexieRecipeIngredient => ({
			id: crypto.randomUUID(),
			recipeId: localId,
			foodId: i.foodId,
			quantity: i.quantity,
			servingUnit: i.servingUnit,
			sortOrder: i.sortOrder
		}))
	);

	const result = await withOfflineFallback(
		() => api.POST('/api/recipes', { body: payload as never }),
		{
			onSuccess: async (data) => {
				// Move the optimistic row onto the server-assigned id so it's
				// reachable under one consistent key afterward.
				await db.recipes.delete(localId);
				await db.recipeIngredients.where('recipeId').equals(localId).delete();
				await putRecipeWithIngredients(data.recipe.id as string, data.recipe);
			},
			method: 'POST',
			url: '/api/recipes',
			body: payload,
			affectedTable: 'recipes',
			affectedId: localId
		}
	);

	if (result.status === 'error') return { status: 'failed' };
	if (result.status === 'applied' && result.data) {
		return { status: 'created', id: (result.data as { recipe: { id: string } }).recipe.id };
	}
	return { status: 'queued', id: localId };
}

async function update(id: string, recipe: Record<string, unknown>): Promise<MutationResult> {
	const now = new Date().toISOString();
	const { ingredients, ...recipeUpdates } = recipe;
	await db.recipes.update(id, { ...recipeUpdates, updatedAt: now });

	if (Array.isArray(ingredients)) {
		await db.recipeIngredients.where('recipeId').equals(id).delete();
		const items: DexieRecipeIngredient[] = (
			ingredients as Array<Partial<DexieRecipeIngredient>>
		).map((ing) => ({
			id: ing.id ?? crypto.randomUUID(),
			recipeId: id,
			foodId: ing.foodId ?? '',
			quantity: ing.quantity ?? 0,
			servingUnit: ing.servingUnit ?? 'g',
			sortOrder: ing.sortOrder ?? 0
		}));
		await db.recipeIngredients.bulkPut(items);
	}

	const result = await withOfflineFallback(
		() =>
			api.PATCH('/api/recipes/{id}', {
				params: { path: { id } },
				body: recipe as never
			}),
		{
			onSuccess: async (data) => {
				await putRecipeWithIngredients(id, data.recipe);
			},
			method: 'PATCH',
			url: `/api/recipes/${id}`,
			body: recipe,
			affectedTable: 'recipes',
			affectedId: id
		}
	);
	if (result.status === 'error') return { status: 'failed' };
	return { status: result.status };
}

type DeleteRecipeResult =
	{ status: 'deleted' } | { status: 'queued' } | { status: 'blocked'; entryCount: number };

/**
 * Deletes a recipe, mirroring the web's other force-delete flows: a
 * conflict (the recipe still has diary entries) must reach the UI instead of
 * being silently swallowed, so this does NOT delete the local Dexie row
 * until the server confirms (or the caller passes `force: true` after the
 * user confirmed).
 */
async function deleteRecipe(id: string, opts?: { force?: boolean }): Promise<DeleteRecipeResult> {
	const force = opts?.force ?? false;

	if (browser && navigator.onLine === false) {
		await db.recipes.delete(id);
		await db.recipeIngredients.where('recipeId').equals(id).delete();
		await enqueue(
			'DELETE',
			`/api/recipes/${id}${force ? '?force=true' : ''}`,
			{},
			{
				affectedTable: 'recipes',
				affectedId: id
			}
		);
		return { status: 'queued' };
	}

	try {
		const { error, response } = await api.DELETE('/api/recipes/{id}', {
			params: { path: { id }, query: force ? { force: true } : undefined }
		});
		if ((error as { error?: string } | undefined)?.error === 'has_entries') {
			return { status: 'blocked', entryCount: (error as { entryCount?: number }).entryCount ?? 0 };
		}
		if (response.ok) {
			await db.recipes.delete(id);
			await db.recipeIngredients.where('recipeId').equals(id).delete();
			return { status: 'deleted' };
		}
		// Any other failure (e.g. a stale-delete LWW conflict) — a refresh will
		// reconcile the local copy with whatever the server actually has.
		await refresh();
		return { status: 'queued' };
	} catch {
		await db.recipes.delete(id);
		await db.recipeIngredients.where('recipeId').equals(id).delete();
		await enqueue(
			'DELETE',
			`/api/recipes/${id}${force ? '?force=true' : ''}`,
			{},
			{
				affectedTable: 'recipes',
				affectedId: id
			}
		);
		return { status: 'queued' };
	}
}

export const recipeService = {
	allRecipes,
	recipeById,
	refresh,
	refreshById,
	create,
	duplicate,
	update,
	delete: deleteRecipe
};
