import { liveQuery } from 'dexie';
import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import type { DexieRecipe, DexieRecipeIngredient, DexieRecipeStep } from '$lib/db/types';
import { api } from '$lib/api/client';
import { enqueue, pendingIdsFor } from '$lib/stores/offline-queue';
import { normalizeLabels } from '$lib/labels';
import { refreshTable, withOfflineFallback } from './base';

function allRecipes() {
	return liveQuery(() => db.recipes.orderBy('name').toArray());
}

function recipeById(id: string) {
	return liveQuery(async () => {
		const recipe = await db.recipes.get(id);
		if (!recipe) return undefined;
		const ingredients = await db.recipeIngredients.where('recipeId').equals(id).toArray();
		const steps = await db.recipeSteps.where('recipeId').equals(id).sortBy('sortOrder');
		return { recipe, ingredients, steps };
	});
}

type StepInput = { text: string; imageUrl?: string | null };

const toStepRows = (recipeId: string, steps: StepInput[]): DexieRecipeStep[] =>
	steps.map((step, index) => ({
		id: crypto.randomUUID(),
		recipeId,
		sortOrder: index,
		text: step.text,
		imageUrl: step.imageUrl ?? null
	}));

async function replaceLocalSteps(recipeId: string, rows: DexieRecipeStep[]) {
	await db.recipeSteps.where('recipeId').equals(recipeId).delete();
	if (rows.length > 0) await db.recipeSteps.bulkPut(rows);
}

/**
 * Cooking steps of a cached recipe, or null when the cache is known to be
 * incomplete (the list said N steps but fewer are mirrored, e.g. the recipe was
 * only ever loaded through the list). Callers use null to avoid treating
 * "not downloaded yet" as "no steps" — an edit would otherwise wipe them.
 */
async function cachedSteps(recipe: DexieRecipe): Promise<DexieRecipeStep[] | null> {
	const rows = await db.recipeSteps.where('recipeId').equals(recipe.id).sortBy('sortOrder');
	if (recipe.stepCount === undefined || rows.length !== recipe.stepCount) return null;
	return rows;
}

async function refresh() {
	await refreshTable<DexieRecipe>({
		table: db.recipes,
		syncTableName: 'recipes',
		fetchServer: async () => {
			const { data } = await api.GET('/api/recipes');
			return (data?.recipes as unknown as DexieRecipe[]) ?? null;
		},
		extraTables: [db.recipeIngredients, db.recipeSteps],
		cascadeDelete: async (staleIds) => {
			await db.recipeIngredients.where('recipeId').anyOf(staleIds).delete();
			await db.recipeSteps.where('recipeId').anyOf(staleIds).delete();
		}
	});
	await prefetchMissingSteps();
}

/**
 * The list endpoint only reports a step count, so download the detail of any
 * recipe whose steps are not mirrored yet — that is what lets the cooking mode
 * open without a connection. Recipes with an un-synced local edit are skipped:
 * the server copy would overwrite it.
 */
async function prefetchMissingSteps() {
	if (browser && navigator.onLine === false) return;
	try {
		const withSteps = (await db.recipes.toArray()).filter((r) => (r.stepCount ?? 0) > 0);
		if (withSteps.length === 0) return;
		const pending = await pendingIdsFor('recipes');
		for (const recipe of withSteps) {
			if (pending.has(recipe.id)) continue;
			const local = await db.recipeSteps.where('recipeId').equals(recipe.id).count();
			if (local !== recipe.stepCount) await refreshById(recipe.id);
		}
	} catch (err) {
		if (!(browser && !navigator.onLine)) {
			Sentry.captureException(err, { extra: { context: 'recipe-service.prefetchMissingSteps' } });
		}
	}
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
	recipe: { ingredients?: unknown; steps?: unknown } & Record<string, unknown>
) {
	const { ingredients, steps, ...recipeData } = recipe;
	const stepRows = Array.isArray(steps)
		? (steps as Array<Partial<DexieRecipeStep> & { text: string }>).map(
				(step, index): DexieRecipeStep => ({
					id: step.id ?? crypto.randomUUID(),
					recipeId: id,
					sortOrder: step.sortOrder ?? index,
					text: step.text,
					imageUrl: step.imageUrl ?? null
				})
			)
		: null;
	await db.recipes.put({
		...recipeData,
		...(stepRows ? { stepCount: stepRows.length } : {})
	} as unknown as DexieRecipe);
	if (stepRows) await replaceLocalSteps(id, stepRows);
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
		stepCount: Array.isArray(recipe.steps) ? recipe.steps.length : 0,
		createdAt: now,
		updatedAt: now
	};

	await db.recipes.put(dexieRecipe);
	if (Array.isArray(recipe.steps)) {
		await replaceLocalSteps(id, toStepRows(id, recipe.steps as StepInput[]));
	}

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
 * Copies a recipe (ingredients, steps, servings, cooked weight) under a new name,
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
	// Step photos may be shared with the copy: the server only unlinks a file
	// once no step, recipe or food references it any more. When the source's
	// steps are not fully cached, fetch them so the copy does not lose them.
	let sourceSteps = await cachedSteps(source);
	if (!sourceSteps) {
		await refreshById(id);
		const reloaded = await db.recipes.get(id);
		sourceSteps = reloaded ? await cachedSteps(reloaded) : null;
		if (!sourceSteps) return { status: 'failed' };
	}

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
		})),
		steps: sourceSteps.map((step) => ({ text: step.text, imageUrl: step.imageUrl }))
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
		stepCount: sourceSteps.length,
		createdAt: now,
		updatedAt: now
	};
	await db.recipes.put(dexieRecipe);
	await replaceLocalSteps(localId, toStepRows(localId, payload.steps));
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
				await db.recipeSteps.where('recipeId').equals(localId).delete();
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
	const { ingredients, steps, ...recipeUpdates } = recipe;
	await db.recipes.update(id, {
		...recipeUpdates,
		...(Array.isArray(steps) ? { stepCount: steps.length } : {}),
		updatedAt: now
	});
	if (Array.isArray(steps)) await replaceLocalSteps(id, toStepRows(id, steps as StepInput[]));

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

/**
 * Replace the recipe's labels, exactly like a food's: the Dexie row is updated
 * first (so search picks the new labels up immediately), then the write goes to
 * the server or into the offline queue with the same idempotency and
 * last-write-wins stamps as a recipe edit. Returns the labels the server could
 * not fit under the per-recipe cap, empty when the write was queued.
 */
async function setLabels(id: string, labels: string[]): Promise<string[]> {
	const normalized = normalizeLabels(labels).sort();
	await db.recipes.update(id, { labels: normalized, updatedAt: new Date().toISOString() });

	let dropped: string[] = [];
	await withOfflineFallback(
		() =>
			api.PUT('/api/recipes/{id}/labels', {
				params: { path: { id } },
				body: { labels }
			}),
		{
			onSuccess: async (data) => {
				await db.recipes.update(id, { labels: data.labels });
				dropped = data.dropped;
			},
			method: 'PUT',
			url: `/api/recipes/${id}/labels`,
			body: { labels },
			affectedTable: 'recipes',
			affectedId: id
		}
	);
	return dropped;
}

type DeleteRecipeResult =
	{ status: 'deleted' } | { status: 'queued' } | { status: 'blocked'; entryCount: number };

/**
 * Deletes a recipe. A conflict (the recipe is still logged in diary entries)
 * must reach the UI instead of being silently swallowed, so this does NOT
 * delete the local Dexie row until the server confirms. There is no force
 * option: the entries have to be removed or changed explicitly first.
 */
async function deleteRecipe(id: string): Promise<DeleteRecipeResult> {
	if (browser && navigator.onLine === false) {
		await queueDelete(id);
		return { status: 'queued' };
	}

	try {
		const { error, response } = await api.DELETE('/api/recipes/{id}', {
			params: { path: { id } }
		});
		if ((error as { error?: string } | undefined)?.error === 'has_entries') {
			return { status: 'blocked', entryCount: (error as { entryCount?: number }).entryCount ?? 0 };
		}
		if (response.ok) {
			await db.recipes.delete(id);
			await db.recipeIngredients.where('recipeId').equals(id).delete();
			await db.recipeSteps.where('recipeId').equals(id).delete();
			return { status: 'deleted' };
		}
		// Any other failure (e.g. a stale-delete LWW conflict) — a refresh will
		// reconcile the local copy with whatever the server actually has.
		await refresh();
		return { status: 'queued' };
	} catch (err) {
		if (typeof navigator === 'undefined' || navigator.onLine) {
			Sentry.captureException(err, { extra: { context: 'recipe-service.remove' } });
		}
		await queueDelete(id);
		return { status: 'queued' };
	}
}

async function queueDelete(id: string) {
	await db.recipes.delete(id);
	await db.recipeIngredients.where('recipeId').equals(id).delete();
	await db.recipeSteps.where('recipeId').equals(id).delete();
	await enqueue(
		'DELETE',
		`/api/recipes/${id}`,
		{},
		{
			affectedTable: 'recipes',
			affectedId: id
		}
	);
}

export const recipeService = {
	allRecipes,
	recipeById,
	cachedSteps,
	refresh,
	refreshById,
	create,
	duplicate,
	update,
	setLabels,
	delete: deleteRecipe
};
