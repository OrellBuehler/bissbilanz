import { getDB } from '$lib/server/db';
import { foods, foodEntries, recipes, recipeIngredients } from '$lib/server/schema';
import { eq, sql, and, count, getTableColumns } from 'drizzle-orm';
import { macroAggregations } from '$lib/server/recipes';
import { roundNutrition } from '$lib/utils/round-nutrition';

export const listFavoriteFoods = async (userId: string, limit = 50) => {
	const db = getDB();

	const results = await db
		.select({
			...getTableColumns(foods),
			logCount: count(foodEntries.id)
		})
		.from(foods)
		.leftJoin(foodEntries, and(eq(foods.id, foodEntries.foodId), eq(foodEntries.userId, userId)))
		.where(and(eq(foods.userId, userId), eq(foods.isFavorite, true)))
		.groupBy(foods.id)
		.orderBy(sql`count(${foodEntries.id}) DESC`)
		.limit(limit);

	return roundNutrition(
		results.map((r) => ({
			...r,
			type: 'food' as const,
			logCount: Number(r.logCount)
		}))
	);
};

export const listFavoriteRecipes = async (userId: string, limit = 50) => {
	const db = getDB();

	const logCountSq = db
		.select({
			recipeId: foodEntries.recipeId,
			logCount: count(foodEntries.id).as('log_count')
		})
		.from(foodEntries)
		.where(eq(foodEntries.userId, userId))
		.groupBy(foodEntries.recipeId)
		.as('log_counts');

	const results = await db
		.select({
			id: recipes.id,
			name: recipes.name,
			imageUrl: recipes.imageUrl,
			totalServings: recipes.totalServings,
			logCount: sql<number>`COALESCE(${logCountSq.logCount}, 0)`,
			...macroAggregations
		})
		.from(recipes)
		.leftJoin(recipeIngredients, eq(recipes.id, recipeIngredients.recipeId))
		.leftJoin(foods, eq(recipeIngredients.foodId, foods.id))
		.leftJoin(logCountSq, eq(recipes.id, logCountSq.recipeId))
		.where(and(eq(recipes.userId, userId), eq(recipes.isFavorite, true)))
		.groupBy(recipes.id, logCountSq.logCount)
		.orderBy(sql`COALESCE(${logCountSq.logCount}, 0) DESC`)
		.limit(limit);

	return roundNutrition(
		results.map((r) => ({
			id: r.id,
			name: r.name,
			imageUrl: r.imageUrl,
			totalServings: r.totalServings,
			calories: Number(r.calories),
			protein: Number(r.protein),
			carbs: Number(r.carbs),
			fat: Number(r.fat),
			fiber: Number(r.fiber),
			type: 'recipe' as const,
			logCount: Number(r.logCount)
		}))
	);
};
