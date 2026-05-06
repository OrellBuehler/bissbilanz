import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import type { DexieRecipe, DexieRecipeIngredient } from '$lib/db/types';
import { api } from '$lib/api/client';
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

	await withOfflineFallback(
		async () => {
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
		},
		{ method: 'POST', url: '/api/recipes', body: recipe, affectedTable: 'recipes', affectedId: id }
	);
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

	await withOfflineFallback(
		async () => {
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
		},
		{
			method: 'PATCH',
			url: `/api/recipes/${id}`,
			body: recipe,
			affectedTable: 'recipes',
			affectedId: id
		}
	);
}

async function deleteRecipe(id: string) {
	await db.recipes.delete(id);
	await db.recipeIngredients.where('recipeId').equals(id).delete();

	await withOfflineFallback(
		async () => {
			await api.DELETE('/api/recipes/{id}', {
				params: { path: { id } }
			});
		},
		{
			method: 'DELETE',
			url: `/api/recipes/${id}`,
			body: {},
			affectedTable: 'recipes',
			affectedId: id
		}
	);
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
