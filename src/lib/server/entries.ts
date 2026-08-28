import { getDB } from '$lib/server/db';
import { foodEntries, foods, recipes, customMealTypes } from '$lib/server/schema';
import { entryCreateSchema, entryUpdateSchema } from '$lib/server/validation';
import { and, count, eq, gte, lte, sql } from 'drizzle-orm';
import type { Result } from '$lib/server/types';
import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
import { roundNutrition } from '$lib/utils/round-nutrition';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';
import { ApiError } from '$lib/server/errors';
import { assertFoodOwned, assertRecipeOwned } from '$lib/server/ownership';
import { buildRecipeMacrosCte, type RecipeMacrosCte } from '$lib/server/recipe-macros';

export const validateMealType = async (userId: string, mealType: string): Promise<boolean> => {
	if ((DEFAULT_MEAL_TYPES as readonly string[]).includes(mealType)) return true;
	const db = getDB();
	const [found] = await db
		.select({ id: customMealTypes.id })
		.from(customMealTypes)
		.where(and(eq(customMealTypes.userId, userId), eq(customMealTypes.name, mealType)))
		.limit(1);
	return !!found;
};

const entryMacroColumns = (rm: RecipeMacrosCte) => ({
	foodName: sql<
		string | null
	>`COALESCE(${foodEntries.quickName}, ${foods.name}, ${recipes.name})`.as('food_name'),
	calories: sql<
		number | null
	>`COALESCE(${foodEntries.quickCalories}, ${foods.calories}, ${rm.rmCalories})`.as('calories'),
	protein: sql<
		number | null
	>`COALESCE(${foodEntries.quickProtein}, ${foods.protein}, ${rm.rmProtein})`.as('protein'),
	carbs: sql<number | null>`COALESCE(${foodEntries.quickCarbs}, ${foods.carbs}, ${rm.rmCarbs})`.as(
		'carbs'
	),
	fat: sql<number | null>`COALESCE(${foodEntries.quickFat}, ${foods.fat}, ${rm.rmFat})`.as('fat'),
	fiber: sql<number | null>`COALESCE(${foodEntries.quickFiber}, ${foods.fiber}, ${rm.rmFiber})`.as(
		'fiber'
	)
});

export const listEntriesByDate = async (
	userId: string,
	date: string,
	options?: { limit?: number; offset?: number }
) => {
	const db = getDB();
	const limit = options?.limit ?? 100;
	const offset = options?.offset ?? 0;

	const whereClause = and(eq(foodEntries.userId, userId), eq(foodEntries.date, date));
	const recipeMacrosCte = buildRecipeMacrosCte(db, userId);

	const [items, countResult] = await Promise.all([
		db
			.with(recipeMacrosCte)
			.select({
				id: foodEntries.id,
				mealType: foodEntries.mealType,
				servings: foodEntries.servings,
				notes: foodEntries.notes,
				foodId: foodEntries.foodId,
				recipeId: foodEntries.recipeId,
				quickName: foodEntries.quickName,
				quickCalories: foodEntries.quickCalories,
				quickProtein: foodEntries.quickProtein,
				quickCarbs: foodEntries.quickCarbs,
				quickFat: foodEntries.quickFat,
				quickFiber: foodEntries.quickFiber,
				quickNutrients: foodEntries.quickNutrients,
				...entryMacroColumns(recipeMacrosCte),
				eatenAt: foodEntries.eatenAt,
				createdAt: foodEntries.createdAt,
				servingSize: foods.servingSize,
				servingUnit: foods.servingUnit
			})
			.from(foodEntries)
			.leftJoin(foods, and(eq(foodEntries.foodId, foods.id), eq(foods.userId, userId)))
			.leftJoin(recipes, and(eq(foodEntries.recipeId, recipes.id), eq(recipes.userId, userId)))
			.leftJoin(recipeMacrosCte, eq(recipeMacrosCte.recipeId, foodEntries.recipeId))
			.where(whereClause)
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(foodEntries).where(whereClause)
	]);

	return roundNutrition({ items, total: countResult[0]?.total ?? 0 });
};

export const createEntry = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof foodEntries.$inferSelect>> => {
	const result = entryCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	if (!(await validateMealType(userId, result.data.mealType))) {
		return {
			success: false,
			error: new ApiError(400, `Invalid meal type: ${result.data.mealType}`)
		};
	}

	try {
		const db = getDB();
		// Reject references to foods/recipes the caller doesn't own (IDOR).
		if (result.data.foodId) await assertFoodOwned(db, userId, result.data.foodId);
		if (result.data.recipeId) await assertRecipeOwned(db, userId, result.data.recipeId);
		const [created] = await db
			.insert(foodEntries)
			.values({
				userId,
				foodId: result.data.foodId ?? null,
				recipeId: result.data.recipeId ?? null,
				mealType: result.data.mealType,
				servings: result.data.servings,
				notes: result.data.notes ?? null,
				date: result.data.date,
				quickName: result.data.quickName ?? null,
				quickCalories: result.data.quickCalories ?? null,
				quickProtein: result.data.quickProtein ?? null,
				quickCarbs: result.data.quickCarbs ?? null,
				quickFat: result.data.quickFat ?? null,
				quickFiber: result.data.quickFiber ?? null,
				quickNutrients: normalizeQuickNutrients(result.data.quickNutrients),
				eatenAt: result.data.eatenAt ? new Date(result.data.eatenAt) : new Date()
			})
			.returning();
		if (!created) {
			return { success: false, error: new Error('Failed to create entry') };
		}
		return { success: true, data: created };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

const normalizeQuickNutrients = (rec: Record<string, number> | null | undefined) =>
	rec && Object.keys(rec).length ? rec : null;

type EntryUpdateInput = typeof entryUpdateSchema._output;

export const toEntryUpdate = (input: EntryUpdateInput) => {
	const { eatenAt, ...rest } = input;
	return {
		...rest,
		// Only touch `notes` when the caller actually sent the field. The update
		// schema is `.partial()`, so an omitted `notes` arrives as undefined — an
		// unconditional `?? null` here wrote NULL and silently destroyed the note on
		// every partial PATCH (e.g. changing only `servings`). An explicit null still
		// clears it, which is what a client sending `notes: null` means.
		...('notes' in input ? { notes: input.notes ?? null } : {}),
		...(input.quickNutrients !== undefined
			? { quickNutrients: normalizeQuickNutrients(input.quickNutrients) }
			: {}),
		...(eatenAt !== undefined ? { eatenAt: eatenAt ? new Date(eatenAt) : new Date() } : {})
	};
};

export const updateEntry = async (
	userId: string,
	id: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<typeof foodEntries.$inferSelect | undefined>> => {
	const result = entryUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	if (result.data.mealType && !(await validateMealType(userId, result.data.mealType))) {
		return {
			success: false,
			error: new ApiError(400, `Invalid meal type: ${result.data.mealType}`)
		};
	}

	try {
		const db = getDB();
		// Reject references to foods/recipes the caller doesn't own (IDOR).
		if (result.data.foodId) await assertFoodOwned(db, userId, result.data.foodId);
		if (result.data.recipeId) await assertRecipeOwned(db, userId, result.data.recipeId);
		// LWW: skip the write when a newer edit already won (guard), and stamp the
		// row with the client's edit time so it stays the logical clock for the next
		// conflict. No row returned ⇒ stale edit or deleted elsewhere (handler 409s).
		const [updated] = await db
			.update(foodEntries)
			.set({ ...toEntryUpdate(result.data), updatedAt: lwwStamp(clientEditedAt) })
			.where(
				and(
					eq(foodEntries.id, id),
					eq(foodEntries.userId, userId),
					lwwGuard(foodEntries.updatedAt, clientEditedAt)
				)
			)
			.returning();
		return { success: true, data: updated };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const deleteEntry = async (userId: string, id: string) => {
	const db = getDB();
	const [deleted] = await db
		.delete(foodEntries)
		.where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)))
		.returning({ id: foodEntries.id, date: foodEntries.date });
	return deleted ?? null;
};

export const listEntriesByDateRange = async (
	userId: string,
	startDate: string,
	endDate: string
) => {
	const db = getDB();
	const recipeMacrosCte = buildRecipeMacrosCte(db, userId);
	const rows = await db
		.with(recipeMacrosCte)
		.select({
			id: foodEntries.id,
			date: foodEntries.date,
			mealType: foodEntries.mealType,
			servings: foodEntries.servings,
			notes: foodEntries.notes,
			foodId: foodEntries.foodId,
			recipeId: foodEntries.recipeId,
			supplementId: foodEntries.supplementId,
			eatenAt: foodEntries.eatenAt,
			quickName: foodEntries.quickName,
			quickCalories: foodEntries.quickCalories,
			quickProtein: foodEntries.quickProtein,
			quickCarbs: foodEntries.quickCarbs,
			quickFat: foodEntries.quickFat,
			quickFiber: foodEntries.quickFiber,
			quickNutrients: foodEntries.quickNutrients,
			servingSize: foods.servingSize,
			servingUnit: foods.servingUnit,
			...entryMacroColumns(recipeMacrosCte)
		})
		.from(foodEntries)
		.leftJoin(foods, and(eq(foodEntries.foodId, foods.id), eq(foods.userId, userId)))
		.leftJoin(recipes, and(eq(foodEntries.recipeId, recipes.id), eq(recipes.userId, userId)))
		.leftJoin(recipeMacrosCte, eq(recipeMacrosCte.recipeId, foodEntries.recipeId))
		.where(
			and(
				eq(foodEntries.userId, userId),
				gte(foodEntries.date, startDate),
				lte(foodEntries.date, endDate)
			)
		);
	return roundNutrition(rows);
};

export const copyEntries = async (userId: string, fromDate: string, toDate: string) => {
	const db = getDB();
	const entries = await db
		.select()
		.from(foodEntries)
		.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, fromDate)));

	if (!entries.length) return [];

	const rows = entries.map((entry) => ({
		userId,
		foodId: entry.foodId,
		recipeId: entry.recipeId,
		mealType: entry.mealType,
		servings: entry.servings,
		notes: entry.notes,
		date: toDate,
		quickName: entry.quickName,
		quickCalories: entry.quickCalories,
		quickProtein: entry.quickProtein,
		quickCarbs: entry.quickCarbs,
		quickFat: entry.quickFat,
		quickFiber: entry.quickFiber,
		quickNutrients: entry.quickNutrients
	}));

	return db.insert(foodEntries).values(rows).returning();
};
