import { getDB } from '$lib/server/db';
import {
	foodEntries,
	foods,
	recipes,
	recipeIngredients,
	customMealTypes
} from '$lib/server/schema';
import { entryCreateSchema, entryUpdateSchema } from '$lib/server/validation';
import { and, count, eq, gte, lte, sql } from 'drizzle-orm';
import type { Result } from '$lib/server/types';
import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
import { roundNutrition } from '$lib/utils/round-nutrition';

const validateMealType = async (userId: string, mealType: string): Promise<boolean> => {
	if ((DEFAULT_MEAL_TYPES as readonly string[]).includes(mealType)) return true;
	const db = getDB();
	const [found] = await db
		.select({ id: customMealTypes.id })
		.from(customMealTypes)
		.where(and(eq(customMealTypes.userId, userId), eq(customMealTypes.name, mealType)))
		.limit(1);
	return !!found;
};

const buildRecipeMacrosCte = (db: ReturnType<typeof getDB>) =>
	db.$with('recipe_macros').as(
		db
			.select({
				recipeId: recipeIngredients.recipeId,
				rmCalories:
					sql<number>`SUM(${foods.calories} * ${recipeIngredients.quantity} / ${foods.servingSize}) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_calories'
					),
				rmProtein:
					sql<number>`SUM(${foods.protein} * ${recipeIngredients.quantity} / ${foods.servingSize}) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_protein'
					),
				rmCarbs:
					sql<number>`SUM(${foods.carbs} * ${recipeIngredients.quantity} / ${foods.servingSize}) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_carbs'
					),
				rmFat:
					sql<number>`SUM(${foods.fat} * ${recipeIngredients.quantity} / ${foods.servingSize}) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_fat'
					),
				rmFiber:
					sql<number>`SUM(${foods.fiber} * ${recipeIngredients.quantity} / ${foods.servingSize}) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_fiber'
					)
			})
			.from(recipeIngredients)
			.innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
			.innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
			.groupBy(recipeIngredients.recipeId, recipes.totalServings)
	);

type RecipeMacrosCte = ReturnType<typeof buildRecipeMacrosCte>;

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
	const recipeMacrosCte = buildRecipeMacrosCte(db);

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
				...entryMacroColumns(recipeMacrosCte),
				eatenAt: foodEntries.eatenAt,
				createdAt: foodEntries.createdAt,
				servingSize: foods.servingSize,
				servingUnit: foods.servingUnit
			})
			.from(foodEntries)
			.leftJoin(foods, eq(foodEntries.foodId, foods.id))
			.leftJoin(recipes, eq(foodEntries.recipeId, recipes.id))
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
		return { success: false, error: new Error(`Invalid meal type: ${result.data.mealType}`) };
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

	if (result.data.mealType && !(await validateMealType(userId, result.data.mealType))) {
		return { success: false, error: new Error(`Invalid meal type: ${result.data.mealType}`) };
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
	const recipeMacrosCte = buildRecipeMacrosCte(db);
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
			...entryMacroColumns(recipeMacrosCte)
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.leftJoin(recipes, eq(foodEntries.recipeId, recipes.id))
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
		quickFiber: entry.quickFiber
	}));

	return db.insert(foodEntries).values(rows).returning();
};
