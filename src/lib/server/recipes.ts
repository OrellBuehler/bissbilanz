import { getDB } from '$lib/server/db';
import { recipes, recipeIngredients, foods, foodEntries } from '$lib/server/schema';
import { recipeCreateSchema, recipeUpdateSchema } from '$lib/server/validation';
import { and, count, eq, sql } from 'drizzle-orm';
import type { Result, DeleteResult } from '$lib/server/types';

type RecipeInput = {
	name: string;
	totalServings: number;
	isFavorite?: boolean;
	imageUrl?: string | null;
};

export type { DeleteResult };

export const toRecipeInsert = (userId: string, input: RecipeInput) => ({
	userId,
	name: input.name,
	totalServings: input.totalServings,
	isFavorite: input.isFavorite ?? false,
	imageUrl: input.imageUrl ?? null
});

export const listRecipes = async (userId: string) => {
	const db = getDB();
	return db
		.select({
			id: recipes.id,
			name: recipes.name,
			totalServings: recipes.totalServings,
			isFavorite: recipes.isFavorite,
			imageUrl: recipes.imageUrl,
			calories: sql<number>`COALESCE(SUM(${foods.calories} * ${recipeIngredients.quantity} / ${foods.servingSize}), 0)`,
			protein: sql<number>`COALESCE(SUM(${foods.protein} * ${recipeIngredients.quantity} / ${foods.servingSize}), 0)`,
			carbs: sql<number>`COALESCE(SUM(${foods.carbs} * ${recipeIngredients.quantity} / ${foods.servingSize}), 0)`,
			fat: sql<number>`COALESCE(SUM(${foods.fat} * ${recipeIngredients.quantity} / ${foods.servingSize}), 0)`
		})
		.from(recipes)
		.leftJoin(recipeIngredients, eq(recipeIngredients.recipeId, recipes.id))
		.leftJoin(foods, eq(foods.id, recipeIngredients.foodId))
		.where(eq(recipes.userId, userId))
		.groupBy(recipes.id)
		.orderBy(recipes.name);
};

export const createRecipe = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof recipes.$inferSelect>> => {
	const result = recipeCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const recipe = await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(recipes)
				.values(toRecipeInsert(userId, result.data))
				.returning();

			if (!created) {
				throw new Error('Failed to create recipe');
			}

			const ingredientRows = result.data.ingredients.map((ingredient, index) => ({
				recipeId: created.id,
				foodId: ingredient.foodId,
				quantity: ingredient.quantity,
				servingUnit: ingredient.servingUnit,
				sortOrder: index
			}));

			await tx.insert(recipeIngredients).values(ingredientRows);
			return created;
		});
		return { success: true, data: recipe };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const getRecipe = async (userId: string, id: string) => {
	const db = getDB();
	const [recipe] = await db
		.select()
		.from(recipes)
		.where(and(eq(recipes.id, id), eq(recipes.userId, userId)));

	if (!recipe) return null;

	const ingredients = await db
		.select()
		.from(recipeIngredients)
		.where(eq(recipeIngredients.recipeId, id))
		.orderBy(recipeIngredients.sortOrder);

	return { ...recipe, ingredients };
};

export const updateRecipe = async (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof recipes.$inferSelect | undefined>> => {
	const result = recipeUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const { ingredients, ...recipeData } = result.data;

		const recipe = await db.transaction(async (tx) => {
			const [updated] = await tx
				.update(recipes)
				.set({ ...recipeData, updatedAt: new Date() })
				.where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
				.returning();

			if (ingredients && updated) {
				await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
				const rows = ingredients.map((ingredient, index) => ({
					recipeId: id,
					foodId: ingredient.foodId,
					quantity: ingredient.quantity,
					servingUnit: ingredient.servingUnit,
					sortOrder: index
				}));
				await tx.insert(recipeIngredients).values(rows);
			}

			return updated;
		});

		return { success: true, data: recipe };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const deleteRecipe = async (
	userId: string,
	id: string,
	force = false
): Promise<DeleteResult> => {
	const db = getDB();

	return db.transaction(async (tx) => {
		const entries = await tx
			.select({ count: count() })
			.from(foodEntries)
			.where(and(eq(foodEntries.recipeId, id), eq(foodEntries.userId, userId)));
		const entryCount = entries[0].count;

		if (entryCount > 0 && !force) {
			return { blocked: true, entryCount } as DeleteResult;
		}

		if (entryCount > 0) {
			await tx
				.delete(foodEntries)
				.where(and(eq(foodEntries.recipeId, id), eq(foodEntries.userId, userId)));
		}
		await tx.delete(recipes).where(and(eq(recipes.id, id), eq(recipes.userId, userId)));

		return { blocked: false } as DeleteResult;
	});
};
