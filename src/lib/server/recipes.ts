import { getDB } from '$lib/server/db';
import { recipes, recipeIngredients, foods, foodEntries } from '$lib/server/schema';
import { recipeCreateSchema, recipeUpdateSchema } from '$lib/server/validation';
import { and, count, eq, sql } from 'drizzle-orm';
import type { Result, DeleteResult } from '$lib/server/types';
import { withValidation } from '$lib/server/errors';
import { roundNutrition } from '$lib/utils/round-nutrition';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';
import { assertFoodOwned } from '$lib/server/ownership';
import { unlinkUpload } from '$lib/server/images';

type RecipeInput = {
	name: string;
	totalServings: number;
	isFavorite?: boolean;
	imageUrl?: string | null;
};

export type { DeleteResult };

export const macroAggregations = {
	calories: sql<number>`COALESCE(SUM(${foods.calories} * ${recipeIngredients.quantity} / ${foods.servingSize}), 0)`,
	protein: sql<number>`COALESCE(SUM(${foods.protein} * ${recipeIngredients.quantity} / ${foods.servingSize}), 0)`,
	carbs: sql<number>`COALESCE(SUM(${foods.carbs} * ${recipeIngredients.quantity} / ${foods.servingSize}), 0)`,
	fat: sql<number>`COALESCE(SUM(${foods.fat} * ${recipeIngredients.quantity} / ${foods.servingSize}), 0)`,
	fiber: sql<number>`COALESCE(SUM(${foods.fiber} * ${recipeIngredients.quantity} / ${foods.servingSize}), 0)`
};

export const toRecipeInsert = (userId: string, input: RecipeInput) => ({
	userId,
	name: input.name,
	totalServings: input.totalServings,
	isFavorite: input.isFavorite ?? false,
	imageUrl: input.imageUrl ?? null
});

export const listRecipes = async (
	userId: string,
	options?: { limit?: number; offset?: number }
) => {
	const db = getDB();
	const whereClause = eq(recipes.userId, userId);

	const q = db
		.select({
			id: recipes.id,
			name: recipes.name,
			totalServings: recipes.totalServings,
			isFavorite: recipes.isFavorite,
			imageUrl: recipes.imageUrl,
			...macroAggregations
		})
		.from(recipes)
		.leftJoin(recipeIngredients, eq(recipeIngredients.recipeId, recipes.id))
		.leftJoin(foods, eq(foods.id, recipeIngredients.foodId))
		.where(whereClause)
		.groupBy(recipes.id)
		.orderBy(recipes.name);

	if (options?.limit !== undefined) q.limit(options.limit);
	if (options?.offset) q.offset(options.offset);

	const [items, countResult] = await Promise.all([
		q,
		db.select({ total: count() }).from(recipes).where(whereClause)
	]);

	return roundNutrition({ items, total: countResult[0]?.total ?? 0 });
};

export const createRecipe = (
	userId: string,
	payload: unknown
): Promise<Result<typeof recipes.$inferSelect>> =>
	withValidation(recipeCreateSchema, payload, async (data) => {
		const db = getDB();
		return db.transaction(async (tx) => {
			const [created] = await tx.insert(recipes).values(toRecipeInsert(userId, data)).returning();

			if (!created) {
				throw new Error('Failed to create recipe');
			}

			const ingredientRows = data.ingredients.map((ingredient, index) => ({
				recipeId: created.id,
				foodId: ingredient.foodId,
				quantity: ingredient.quantity,
				servingUnit: ingredient.servingUnit,
				sortOrder: index
			}));

			// Reject ingredients referencing foods the caller doesn't own (IDOR).
			for (const ingredient of data.ingredients) {
				await assertFoodOwned(tx, userId, ingredient.foodId);
			}
			await tx.insert(recipeIngredients).values(ingredientRows);
			return created;
		});
	});

export const getRecipe = async (userId: string, id: string) => {
	const db = getDB();
	const [recipeResult, ingredients] = await Promise.all([
		db
			.select({
				id: recipes.id,
				userId: recipes.userId,
				name: recipes.name,
				totalServings: recipes.totalServings,
				isFavorite: recipes.isFavorite,
				imageUrl: recipes.imageUrl,
				...macroAggregations,
				createdAt: recipes.createdAt,
				updatedAt: recipes.updatedAt
			})
			.from(recipes)
			.leftJoin(recipeIngredients, eq(recipeIngredients.recipeId, recipes.id))
			.leftJoin(foods, eq(foods.id, recipeIngredients.foodId))
			.where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
			.groupBy(recipes.id),
		db
			.select()
			.from(recipeIngredients)
			.where(eq(recipeIngredients.recipeId, id))
			.orderBy(recipeIngredients.sortOrder)
	]);

	const recipe = recipeResult[0];
	if (!recipe) return null;

	return roundNutrition({ ...recipe, ingredients });
};

export const updateRecipe = (
	userId: string,
	id: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<typeof recipes.$inferSelect | null>> =>
	withValidation(recipeUpdateSchema, payload, async (data) => {
		const db = getDB();
		const { ingredients, ...recipeData } = data;

		return db.transaction(async (tx) => {
			const [updated] = await tx
				.update(recipes)
				.set({ ...recipeData, updatedAt: lwwStamp(clientEditedAt) })
				.where(
					and(
						eq(recipes.id, id),
						eq(recipes.userId, userId),
						lwwGuard(recipes.updatedAt, clientEditedAt)
					)
				)
				.returning();

			if (!updated) return null;

			if (ingredients) {
				// Reject ingredients referencing foods the caller doesn't own (IDOR).
				for (const ingredient of ingredients) {
					await assertFoodOwned(tx, userId, ingredient.foodId);
				}
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
	});

export const deleteRecipe = async (
	userId: string,
	id: string,
	force = false
): Promise<DeleteResult> => {
	const db = getDB();

	const result = await db.transaction(async (tx) => {
		const entries = await tx
			.select({ count: count() })
			.from(foodEntries)
			.where(and(eq(foodEntries.recipeId, id), eq(foodEntries.userId, userId)));
		const entryCount = entries[0].count;

		if (entryCount > 0 && !force) {
			return { deleted: { blocked: true, entryCount } as DeleteResult, imageUrl: null };
		}

		if (entryCount > 0) {
			await tx
				.delete(foodEntries)
				.where(and(eq(foodEntries.recipeId, id), eq(foodEntries.userId, userId)));
		}
		const [deleted] = await tx
			.delete(recipes)
			.where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
			.returning({ imageUrl: recipes.imageUrl });

		return { deleted: { blocked: false } as DeleteResult, imageUrl: deleted?.imageUrl ?? null };
	});

	// After commit, so a rolled-back delete never destroys the file.
	if (!result.deleted.blocked) await unlinkUpload(result.imageUrl);
	return result.deleted;
};
