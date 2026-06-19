import { getDB } from '$lib/server/db';
import { foods, foodEntries, recipeIngredients, supplementIngredients } from '$lib/server/schema';
import { foodCreateSchema, foodUpdateSchema } from '$lib/server/validation';
import { and, count, desc, eq, getTableColumns, ilike, isNotNull } from 'drizzle-orm';
import { ApiError } from '$lib/server/errors';
import { pickNutrients } from '$lib/nutrients';
import type { Result, DeleteResult } from '$lib/server/types';
import { roundNutrition } from '$lib/utils/round-nutrition';

type FoodCreateInput = typeof foodCreateSchema._output;

function isDuplicateBarcodeError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const msg = error.message;
	return msg.includes('unique constraint') && msg.includes('barcode');
}

async function handleBarcodeConflict(
	error: unknown,
	userId: string,
	barcode: string | null | undefined,
	dbOverride?: ReturnType<typeof getDB>
): Promise<Result<never> | null> {
	if (!isDuplicateBarcodeError(error) || !barcode) return null;
	const existing = await findFoodByBarcode(userId, barcode, dbOverride).catch(() => null);
	const name = existing?.name ?? 'unknown';
	return {
		success: false,
		error: new ApiError(409, `A food with barcode ${barcode} already exists: "${name}"`)
	};
}

export type { DeleteResult };

export const toFoodInsert = (userId: string, input: FoodCreateInput) => {
	return {
		userId,
		name: input.name,
		brand: input.brand ?? null,
		servingSize: input.servingSize,
		servingUnit: input.servingUnit,
		calories: input.calories,
		protein: input.protein,
		carbs: input.carbs,
		fat: input.fat,
		fiber: input.fiber,
		barcode: input.barcode || null,
		isFavorite: input.isFavorite ?? false,
		// Open Food Facts quality data
		nutriScore: input.nutriScore ?? null,
		novaGroup: input.novaGroup ?? null,
		additives: input.additives ?? null,
		ingredientsText: input.ingredientsText ?? null,
		imageUrl: input.imageUrl ?? null,
		// All extended nutrients (keys derived from catalog)
		...pickNutrients(input as Record<string, unknown>)
	} as typeof foods.$inferInsert;
};

export const getFood = async (userId: string, id: string) => {
	const db = getDB();
	const [food] = await db
		.select()
		.from(foods)
		.where(and(eq(foods.id, id), eq(foods.userId, userId)));
	return food ? roundNutrition(food) : null;
};

export const listFoods = async (
	userId: string,
	options?: { query?: string; limit?: number; offset?: number; includeSupplements?: boolean }
) => {
	const db = getDB();
	const offset = options?.offset ?? 0;
	const escapedQuery = options?.query
		?.replace(/\\/g, '\\\\')
		.replace(/%/g, '\\%')
		.replace(/_/g, '\\_');
	const kindFilter = options?.includeSupplements ? undefined : eq(foods.kind, 'food');
	const whereClause = escapedQuery
		? and(eq(foods.userId, userId), ilike(foods.name, `%${escapedQuery}%`), kindFilter)
		: and(eq(foods.userId, userId), kindFilter);

	const q = db.select().from(foods).where(whereClause).orderBy(foods.name);
	if (options?.limit !== undefined) q.limit(options.limit);

	const [items, countResult] = await Promise.all([
		q.offset(offset),
		db.select({ total: count() }).from(foods).where(whereClause)
	]);

	return roundNutrition({ items, total: countResult[0]?.total ?? 0 });
};

export const createFood = async (
	userId: string,
	payload: unknown,
	dbOverride?: ReturnType<typeof getDB>
): Promise<Result<typeof foods.$inferSelect>> => {
	const result = foodCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = dbOverride ?? getDB();
		const [created] = await db.insert(foods).values(toFoodInsert(userId, result.data)).returning();
		if (!created) {
			return { success: false, error: new Error('Failed to create food') };
		}
		return { success: true, data: roundNutrition(created) };
	} catch (error) {
		return (
			(await handleBarcodeConflict(error, userId, result.data.barcode, dbOverride)) ?? {
				success: false,
				error: error as Error
			}
		);
	}
};

type FoodUpdateInput = typeof foodUpdateSchema._output;

export const toFoodUpdate = (input: FoodUpdateInput) => {
	const update = { ...input };
	if (input.barcode !== undefined) update.barcode = input.barcode || null;
	return update;
};

export const updateFood = async (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof foods.$inferSelect | undefined>> => {
	const result = foodUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [updated] = await db
			.update(foods)
			.set({ ...toFoodUpdate(result.data), updatedAt: new Date() })
			.where(and(eq(foods.id, id), eq(foods.userId, userId)))
			.returning();
		return { success: true, data: updated ? roundNutrition(updated) : updated };
	} catch (error) {
		return (
			(await handleBarcodeConflict(error, userId, result.data.barcode)) ?? {
				success: false,
				error: error as Error
			}
		);
	}
};

export const deleteFood = async (
	userId: string,
	id: string,
	force = false
): Promise<DeleteResult> => {
	const db = getDB();

	return db.transaction(async (tx) => {
		const [entries, ingredients, supplementIngs] = await Promise.all([
			tx
				.select({ count: count() })
				.from(foodEntries)
				.where(and(eq(foodEntries.foodId, id), eq(foodEntries.userId, userId))),
			tx.select({ count: count() }).from(recipeIngredients).where(eq(recipeIngredients.foodId, id)),
			tx
				.select({ count: count() })
				.from(supplementIngredients)
				.where(eq(supplementIngredients.foodId, id))
		]);
		const entryCount = entries[0].count;
		const ingredientCount = ingredients[0].count;
		const supplementIngredientCount = supplementIngs[0].count;

		// Supplement ingredients use ON DELETE RESTRICT on foodId, so they would
		// block a hard delete at the DB level. Surface that as a blocked result
		// and require the user to unlink via the supplement UI — `force` does
		// not override this (we'd leave dangling supplements otherwise).
		if (supplementIngredientCount > 0) {
			return {
				blocked: true,
				entryCount,
				ingredientCount,
				supplementIngredientCount
			} as DeleteResult;
		}

		if ((entryCount > 0 || ingredientCount > 0) && !force) {
			return { blocked: true, entryCount, ingredientCount } as DeleteResult;
		}

		if (entryCount > 0) {
			await tx
				.delete(foodEntries)
				.where(and(eq(foodEntries.foodId, id), eq(foodEntries.userId, userId)));
		}
		await tx.delete(foods).where(and(eq(foods.id, id), eq(foods.userId, userId)));

		return { blocked: false } as DeleteResult;
	});
};

export const findFoodByBarcode = async (
	userId: string,
	barcode: string,
	dbOverride?: ReturnType<typeof getDB>
) => {
	const db = dbOverride ?? getDB();
	const [food] = await db
		.select()
		.from(foods)
		.where(and(eq(foods.userId, userId), eq(foods.barcode, barcode)));
	return food ?? null;
};

export const listRecentFoods = async (userId: string, limit = 25) => {
	const db = getDB();
	// One row per food: the most recently logged entry. DISTINCT ON keeps the
	// first row per food_id given the ORDER BY, so ordering by created_at DESC
	// within each food yields its latest entry (and its servings).
	const recentSq = db
		.selectDistinctOn([foodEntries.foodId], {
			foodId: foodEntries.foodId,
			lastUsed: foodEntries.createdAt,
			lastServings: foodEntries.servings
		})
		.from(foodEntries)
		.where(and(eq(foodEntries.userId, userId), isNotNull(foodEntries.foodId)))
		.orderBy(foodEntries.foodId, desc(foodEntries.createdAt))
		.as('recent');

	const rows = await db
		.select({ ...getTableColumns(foods), lastServings: recentSq.lastServings })
		.from(foods)
		.innerJoin(recentSq, eq(foods.id, recentSq.foodId))
		.where(and(eq(foods.userId, userId), eq(foods.kind, 'food')))
		.orderBy(desc(recentSq.lastUsed))
		.limit(limit);
	return roundNutrition(rows);
};
