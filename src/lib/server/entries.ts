import { getDB } from '$lib/server/db';
import { foodEntries, foods, recipes } from '$lib/server/schema';
import { entryCreateSchema, entryUpdateSchema } from '$lib/server/validation';
import { type AnyColumn, and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Result } from '$lib/server/types';

/**
 * SQL helper: resolves a macro value from quick entry, food, or recipe subquery.
 * Eliminates duplication across listEntriesByDate and listEntriesByDateRange.
 */
const entryMacroSql = (
	quickCol: AnyColumn,
	foodCol: AnyColumn,
	recipeMacro: string,
	alias: string
) =>
	sql<number | null>`COALESCE(${quickCol}, ${foodCol}, (SELECT COALESCE(SUM(f2.${sql.raw(recipeMacro)} * ri.quantity / f2.serving_size), 0) / NULLIF(${recipes.totalServings}, 0) FROM recipe_ingredients ri JOIN foods f2 ON f2.id = ri.food_id WHERE ri.recipe_id = ${foodEntries.recipeId}))`.as(
		alias
	);

const entryMacroColumns = () => ({
	foodName: sql<string | null>`COALESCE(${foodEntries.quickName}, ${foods.name}, ${recipes.name})`.as('food_name'),
	calories: entryMacroSql(foodEntries.quickCalories, foods.calories, 'calories', 'calories'),
	protein: entryMacroSql(foodEntries.quickProtein, foods.protein, 'protein', 'protein'),
	carbs: entryMacroSql(foodEntries.quickCarbs, foods.carbs, 'carbs', 'carbs'),
	fat: entryMacroSql(foodEntries.quickFat, foods.fat, 'fat', 'fat'),
	fiber: entryMacroSql(foodEntries.quickFiber, foods.fiber, 'fiber', 'fiber')
});

export const listEntriesByDate = async (
	userId: string,
	date: string,
	options?: { limit?: number; offset?: number }
) => {
	const db = getDB();
	const limit = options?.limit ?? 100;
	const offset = options?.offset ?? 0;

	return db
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
			...entryMacroColumns(),
			eatenAt: foodEntries.eatenAt,
			createdAt: foodEntries.createdAt,
			servingSize: foods.servingSize,
			servingUnit: foods.servingUnit
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.leftJoin(recipes, eq(foodEntries.recipeId, recipes.id))
		.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, date)))
		.limit(limit)
		.offset(offset);
};

export const createEntry = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof foodEntries.$inferSelect>> => {
	const result = entryCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
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
				eatenAt: result.data.eatenAt ? new Date(result.data.eatenAt) : null
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

type EntryUpdateInput = typeof entryUpdateSchema._output;

export const toEntryUpdate = (input: EntryUpdateInput) => {
	const { eatenAt, ...rest } = input;
	return {
		...rest,
		notes: input.notes ?? null,
		...(eatenAt !== undefined ? { eatenAt: eatenAt ? new Date(eatenAt) : null } : {})
	};
};

export const updateEntry = async (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof foodEntries.$inferSelect | undefined>> => {
	const result = entryUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [updated] = await db
			.update(foodEntries)
			.set({ ...toEntryUpdate(result.data), updatedAt: new Date() })
			.where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)))
			.returning();
		return { success: true, data: updated };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const deleteEntry = async (userId: string, id: string) => {
	const db = getDB();
	await db.delete(foodEntries).where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)));
};

export const listEntriesByDateRange = async (
	userId: string,
	startDate: string,
	endDate: string
) => {
	const db = getDB();
	return db
		.select({
			id: foodEntries.id,
			date: foodEntries.date,
			mealType: foodEntries.mealType,
			servings: foodEntries.servings,
			notes: foodEntries.notes,
			foodId: foodEntries.foodId,
			recipeId: foodEntries.recipeId,
			...entryMacroColumns()
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.leftJoin(recipes, eq(foodEntries.recipeId, recipes.id))
		.where(
			and(
				eq(foodEntries.userId, userId),
				gte(foodEntries.date, startDate),
				lte(foodEntries.date, endDate)
			)
		);
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
		quickFiber: entry.quickFiber
	}));

	return db.insert(foodEntries).values(rows).returning();
};
