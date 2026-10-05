import { getDB } from '$lib/server/db';
import { recipes, recipeIngredients, recipeSteps, foods, foodEntries } from '$lib/server/schema';
import {
	recipeCreateSchema,
	recipeUpdateSchema,
	type recipeIngredientSchema
} from '$lib/server/validation';
import { and, count, eq, sql, type SQL } from 'drizzle-orm';
import type { Result, DeleteResult } from '$lib/server/types';
import { ApiError, withValidation } from '$lib/server/errors';
import { roundNutrition } from '$lib/utils/round-nutrition';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';
import { assertFoodOwnedForIngredient, assertRecipeOwned } from '$lib/server/ownership';
import { recipeScaleFactor, scaleIngredients } from '$lib/utils/recipe-scaling';
import type { z } from 'zod';
import { unlinkUpload, unlinkUploads, uploadFilename } from '$lib/server/images';
import { convertedIngredientQuantitySql } from '$lib/server/recipe-macros';
import { ALL_NUTRIENT_KEYS, NUTRIENT_BY_KEY } from '$lib/nutrients';
import { nutrientColumn } from '$lib/server/nutrient-columns';

type RecipeInput = {
	name: string;
	totalServings: number;
	isFavorite?: boolean;
	imageUrl?: string | null;
	cookedWeight?: number | null;
};

export type { DeleteResult };

export const macroAggregations = {
	calories: sql<number>`COALESCE(SUM(${foods.calories} * ${convertedIngredientQuantitySql} / ${foods.servingSize}), 0)`,
	protein: sql<number>`COALESCE(SUM(${foods.protein} * ${convertedIngredientQuantitySql} / ${foods.servingSize}), 0)`,
	carbs: sql<number>`COALESCE(SUM(${foods.carbs} * ${convertedIngredientQuantitySql} / ${foods.servingSize}), 0)`,
	fat: sql<number>`COALESCE(SUM(${foods.fat} * ${convertedIngredientQuantitySql} / ${foods.servingSize}), 0)`,
	fiber: sql<number>`COALESCE(SUM(${foods.fiber} * ${convertedIngredientQuantitySql} / ${foods.servingSize}), 0)`
};

type StepInput = { text: string; imageUrl?: string | null };

const toStepRows = (recipeId: string, steps: StepInput[]) =>
	steps.map((step, index) => ({
		recipeId,
		sortOrder: index,
		text: step.text,
		imageUrl: step.imageUrl ?? null
	}));

/**
 * Unlink uploads a recipe no longer uses, unless another recipe step, recipe
 * cover or food still points at the same file (a duplicated recipe reuses its
 * source's step images). Run after the transaction so it sees the final state.
 */
export const unlinkUnreferencedUploads = async (
	urls: (string | null | undefined)[],
	userId: string
): Promise<void> => {
	const db = getDB();
	const unreferenced: string[] = [];
	for (const url of new Set(urls)) {
		if (!uploadFilename(url) || !url) continue;
		const [step, recipe, food] = await Promise.all([
			db
				.select({ id: recipeSteps.id })
				.from(recipeSteps)
				.where(eq(recipeSteps.imageUrl, url))
				.limit(1),
			db.select({ id: recipes.id }).from(recipes).where(eq(recipes.imageUrl, url)).limit(1),
			db.select({ id: foods.id }).from(foods).where(eq(foods.imageUrl, url)).limit(1)
		]);
		if (step.length + recipe.length + food.length === 0) unreferenced.push(url);
	}
	await unlinkUploads(unreferenced, userId);
};

export const toRecipeInsert = (userId: string, input: RecipeInput) => ({
	userId,
	name: input.name,
	totalServings: input.totalServings,
	isFavorite: input.isFavorite ?? false,
	imageUrl: input.imageUrl ?? null,
	cookedWeight: input.cookedWeight ?? null
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
			cookedWeight: recipes.cookedWeight,
			...macroAggregations,
			stepCount: sql<number>`(SELECT count(*)::int FROM ${recipeSteps} WHERE ${recipeSteps.recipeId} = ${recipes.id})`
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
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<typeof recipes.$inferSelect>> =>
	withValidation(recipeCreateSchema, payload, async (data) => {
		const db = getDB();
		return db.transaction(async (tx) => {
			const [created] = await tx
				.insert(recipes)
				.values({ ...toRecipeInsert(userId, data), updatedAt: lwwStamp(clientEditedAt) })
				.returning();

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
				await assertFoodOwnedForIngredient(tx, userId, ingredient.foodId, ingredient.servingUnit);
			}
			await tx.insert(recipeIngredients).values(ingredientRows);
			if (data.steps?.length) {
				await tx.insert(recipeSteps).values(toStepRows(created.id, data.steps));
			}
			return created;
		});
	});

/**
 * Per-serving totals for every extended nutrient (`$lib/nutrients` —
 * vitamins, minerals, fat breakdown, etc.), computed the same way as the
 * core macros (`macroAggregations`): each ingredient contributes
 * `food.nutrient * convertedQuantity / food.servingSize`, then the whole-
 * recipe sum is divided by `totalServings`. Named "PerServing" (unlike the
 * whole-recipe core macros) to match what a nutrient panel usually shows.
 */
const extendedNutrientFields = () => {
	const fields: Record<string, SQL.Aliased<number | null>> = {};
	for (const key of ALL_NUTRIENT_KEYS) {
		const dbColumn = NUTRIENT_BY_KEY.get(key)?.dbColumn ?? key;
		fields[key] = sql<
			number | null
		>`SUM(${nutrientColumn(foods, key)} * ${convertedIngredientQuantitySql} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
			`ext_${dbColumn}`
		);
	}
	return fields;
};

const getRecipeExtendedNutrients = async (
	db: ReturnType<typeof getDB>,
	userId: string,
	id: string
) => {
	const [row] = await db
		.select(extendedNutrientFields())
		.from(recipeIngredients)
		.innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
		.innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
		.where(and(eq(recipeIngredients.recipeId, id), eq(recipes.userId, userId)))
		.groupBy(recipes.totalServings);
	return row ?? Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, null]));
};

export const getRecipe = async (userId: string, id: string) => {
	const db = getDB();
	const [recipeResult, ingredients, steps, extendedNutrientsPerServing] = await Promise.all([
		db
			.select({
				id: recipes.id,
				userId: recipes.userId,
				name: recipes.name,
				totalServings: recipes.totalServings,
				isFavorite: recipes.isFavorite,
				imageUrl: recipes.imageUrl,
				cookedWeight: recipes.cookedWeight,
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
			.orderBy(recipeIngredients.sortOrder),
		db
			.select({
				id: recipeSteps.id,
				sortOrder: recipeSteps.sortOrder,
				text: recipeSteps.text,
				imageUrl: recipeSteps.imageUrl
			})
			.from(recipeSteps)
			.where(eq(recipeSteps.recipeId, id))
			.orderBy(recipeSteps.sortOrder),
		getRecipeExtendedNutrients(db, userId, id)
	]);

	const recipe = recipeResult[0];
	if (!recipe) return null;

	return roundNutrition({ ...recipe, ingredients, steps, extendedNutrientsPerServing });
};

export const updateRecipe = (
	userId: string,
	id: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<typeof recipes.$inferSelect | null>> =>
	withValidation(recipeUpdateSchema, payload, async (data) => {
		const db = getDB();
		const { ingredients, steps, ...recipeData } = data;

		const result = await db.transaction(async (tx) => {
			const [previous] =
				recipeData.imageUrl !== undefined
					? await tx
							.select({ imageUrl: recipes.imageUrl })
							.from(recipes)
							.where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
					: [];
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

			if (!updated) return { updated: null, superseded: null, droppedStepImages: [] };

			if (ingredients) {
				// Reject ingredients referencing foods the caller doesn't own (IDOR).
				for (const ingredient of ingredients) {
					await assertFoodOwnedForIngredient(tx, userId, ingredient.foodId, ingredient.servingUnit);
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

			let droppedStepImages: (string | null)[] = [];
			if (steps) {
				const previousSteps = await tx
					.select({ imageUrl: recipeSteps.imageUrl })
					.from(recipeSteps)
					.where(eq(recipeSteps.recipeId, id));
				await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
				if (steps.length) await tx.insert(recipeSteps).values(toStepRows(id, steps));
				const kept = new Set(steps.map((step) => step.imageUrl));
				droppedStepImages = previousSteps
					.map((row) => row.imageUrl)
					.filter((url) => !kept.has(url));
			}

			// Only when the write actually landed and the image really changed — an
			// LWW-rejected update leaves the old URL in place.
			const superseded =
				previous?.imageUrl && previous.imageUrl !== updated.imageUrl ? previous.imageUrl : null;
			return { updated, superseded, droppedStepImages };
		});

		// After commit, so a rolled-back update never destroys the file.
		if (result.superseded) await unlinkUpload(result.superseded, userId);
		if (result.droppedStepImages.length) {
			await unlinkUnreferencedUploads(result.droppedStepImages, userId);
		}
		return result.updated;
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
			return {
				deleted: { blocked: true, entryCount } as DeleteResult,
				imageUrl: null,
				stepImages: []
			};
		}

		if (entryCount > 0) {
			await tx
				.delete(foodEntries)
				.where(and(eq(foodEntries.recipeId, id), eq(foodEntries.userId, userId)));
		}
		const stepImages = (
			await tx
				.select({ imageUrl: recipeSteps.imageUrl })
				.from(recipeSteps)
				.innerJoin(recipes, eq(recipes.id, recipeSteps.recipeId))
				.where(and(eq(recipeSteps.recipeId, id), eq(recipes.userId, userId)))
		).map((row) => row.imageUrl);
		const [deleted] = await tx
			.delete(recipes)
			.where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
			.returning({ imageUrl: recipes.imageUrl });

		return {
			deleted: { blocked: false } as DeleteResult,
			imageUrl: deleted?.imageUrl ?? null,
			stepImages: deleted ? stepImages : []
		};
	});

	// After commit, so a rolled-back delete never destroys the file.
	if (!result.deleted.blocked) {
		await unlinkUpload(result.imageUrl, userId);
		await unlinkUnreferencedUploads(result.stepImages, userId);
	}
	return result.deleted;
};

export type IncludedRecipe = { recipeId: string; servings?: number; grams?: number };

export const expandIncludedRecipes = async (
	userId: string,
	includes: IncludedRecipe[]
): Promise<z.infer<typeof recipeIngredientSchema>[]> => {
	const db = getDB();
	const expanded: z.infer<typeof recipeIngredientSchema>[] = [];
	for (const include of includes) {
		await assertRecipeOwned(db, userId, include.recipeId);
		const [recipe] = await db
			.select({ totalServings: recipes.totalServings, cookedWeight: recipes.cookedWeight })
			.from(recipes)
			.where(and(eq(recipes.id, include.recipeId), eq(recipes.userId, userId)))
			.limit(1);
		if (!recipe) throw new ApiError(404, 'Recipe not found');
		const mode = include.grams !== undefined ? 'grams' : 'servings';
		const amount = include.grams ?? include.servings ?? 0;
		if (mode === 'grams' && !(recipe.cookedWeight && recipe.cookedWeight > 0)) {
			throw new ApiError(
				400,
				`Recipe ${include.recipeId} has no cookedWeight, so it cannot be included by grams; pass servings instead`
			);
		}
		const factor = recipeScaleFactor(recipe, amount, mode);
		if (factor === null) {
			throw new ApiError(
				400,
				`Recipe ${include.recipeId}: amount must be a positive number of servings or grams`
			);
		}
		const rows = await db
			.select({
				foodId: recipeIngredients.foodId,
				quantity: recipeIngredients.quantity,
				servingUnit: recipeIngredients.servingUnit
			})
			.from(recipeIngredients)
			.where(eq(recipeIngredients.recipeId, include.recipeId))
			.orderBy(recipeIngredients.sortOrder);
		expanded.push(...scaleIngredients(rows, factor));
	}
	return expanded;
};
