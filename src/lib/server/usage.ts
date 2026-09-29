import { getDB } from '$lib/server/db';
import {
	foodEntries,
	foods,
	recipeIngredients,
	recipes,
	supplementIngredients,
	supplements
} from '$lib/server/schema';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { findLastIngredientRecipes } from '$lib/server/foods';

// Enough to find and fix every entry in practice; the total tells clients when
// the list is cut short.
export const USAGE_ENTRY_LIMIT = 200;

type UsageEntry = {
	id: string;
	date: string;
	mealType: string;
	servings: number;
	eatenAt: string;
};

const listUsageEntries = async (
	where: SQL | undefined
): Promise<{ totalEntries: number; entries: UsageEntry[] }> => {
	const db = getDB();
	const [totals, rows] = await Promise.all([
		db.select({ total: count() }).from(foodEntries).where(where),
		db
			.select({
				id: foodEntries.id,
				date: foodEntries.date,
				mealType: foodEntries.mealType,
				servings: foodEntries.servings,
				eatenAt: foodEntries.eatenAt
			})
			.from(foodEntries)
			.where(where)
			.orderBy(desc(foodEntries.date), desc(foodEntries.eatenAt), desc(foodEntries.createdAt))
			.limit(USAGE_ENTRY_LIMIT)
	]);
	return {
		totalEntries: totals[0]?.total ?? 0,
		entries: rows.map((row) => ({ ...row, eatenAt: row.eatenAt.toISOString() }))
	};
};

export const getRecipeUsage = async (userId: string, recipeId: string) => {
	const db = getDB();
	const [recipe] = await db
		.select({ id: recipes.id })
		.from(recipes)
		.where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId)));
	if (!recipe) return null;
	return listUsageEntries(and(eq(foodEntries.recipeId, recipeId), eq(foodEntries.userId, userId)));
};

export const getFoodUsage = async (userId: string, foodId: string) => {
	const db = getDB();
	const [food] = await db
		.select({ id: foods.id })
		.from(foods)
		.where(and(eq(foods.id, foodId), eq(foods.userId, userId)));
	if (!food) return null;

	const [entryUsage, recipeRows, lastIngredient, supplementRows] = await Promise.all([
		listUsageEntries(and(eq(foodEntries.foodId, foodId), eq(foodEntries.userId, userId))),
		db
			.selectDistinct({ id: recipes.id, name: recipes.name })
			.from(recipeIngredients)
			.innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
			.where(and(eq(recipeIngredients.foodId, foodId), eq(recipes.userId, userId)))
			.orderBy(recipes.name),
		findLastIngredientRecipes(db, userId, foodId),
		db
			.selectDistinct({ id: supplements.id, name: supplements.name })
			.from(supplementIngredients)
			.innerJoin(supplements, eq(supplements.id, supplementIngredients.supplementId))
			.where(and(eq(supplementIngredients.foodId, foodId), eq(supplements.userId, userId)))
			.orderBy(supplements.name)
	]);
	const lastIds = new Set(lastIngredient.map((row) => row.id));

	return {
		...entryUsage,
		recipes: recipeRows.map((row) => ({ ...row, isLastIngredient: lastIds.has(row.id) })),
		supplements: supplementRows
	};
};
