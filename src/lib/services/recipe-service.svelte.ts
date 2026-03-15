import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import type { DexieRecipe, DexieRecipeIngredient } from '$lib/db/types';
import { api } from '$lib/api/client';
import { enqueue } from '$lib/stores/offline-queue';

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
	try {
		const { data } = await api.GET('/api/recipes');
		if (data) {
			const serverRecipes = data.recipes as unknown as DexieRecipe[];
			const serverIds = new Set(serverRecipes.map((r) => r.id));
			const localIds = await db.recipes.toCollection().primaryKeys();
			const staleIds = localIds.filter((id) => !serverIds.has(id as string));
			await db.transaction('rw', db.recipes, db.recipeIngredients, db.syncMeta, async () => {
				if (staleIds.length > 0) {
					await db.recipeIngredients
						.where('recipeId')
						.anyOf(staleIds as string[])
						.delete();
					await db.recipes.bulkDelete(staleIds as string[]);
				}
				await db.recipes.bulkPut(serverRecipes);
				await db.syncMeta.put({ tableName: 'recipes', lastSyncedAt: Date.now() });
			});
		}
	} catch {
		// fire-and-forget
	}
}

async function refreshById(id: string) {
	try {
		const { data } = await api.GET('/api/recipes/{id}', {
			params: { path: { id } }
		});
		if (data) {
			const { ingredients, ...recipeData } = data.recipe;
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
	} catch {
		// fire-and-forget
	}
}

async function create(recipe: Record<string, unknown>) {
	const now = new Date().toISOString();
	const id = (recipe.id as string) ?? crypto.randomUUID();

	const dexieRecipe: DexieRecipe = {
		id,
		userId: '',
		name: (recipe.name as string) ?? '',
		totalServings: (recipe.totalServings as number) ?? 1,
		isFavorite: false,
		imageUrl: null,
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

	try {
		const { data } = await api.POST('/api/recipes', { body: recipe as never });
		if (data) {
			const { ingredients, ...recipeData } = data.recipe;
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
	} catch {
		await enqueue('POST', '/api/recipes', recipe, {
			affectedTable: 'recipes',
			affectedId: id
		});
	}
}

async function update(id: string, recipe: Record<string, unknown>) {
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

	try {
		const { data } = await api.PATCH('/api/recipes/{id}', {
			params: { path: { id } },
			body: recipe as never
		});
		if (data) {
			const { ingredients: respIngredients, ...respRecipeData } = data.recipe;
			await db.recipes.put(respRecipeData as unknown as DexieRecipe);
			if (Array.isArray(respIngredients)) {
				await db.recipeIngredients.where('recipeId').equals(id).delete();
				await db.recipeIngredients.bulkPut(
					respIngredients.map((ing) => ({
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
	} catch {
		await enqueue('PATCH', `/api/recipes/${id}`, recipe, {
			affectedTable: 'recipes',
			affectedId: id
		});
	}
}

async function deleteRecipe(id: string) {
	await db.recipes.delete(id);
	await db.recipeIngredients.where('recipeId').equals(id).delete();

	try {
		await api.DELETE('/api/recipes/{id}', {
			params: { path: { id } }
		});
	} catch {
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
}

export const recipeService = {
	allRecipes,
	recipeById,
	refresh,
	refreshById,
	create,
	update,
	delete: deleteRecipe
};
