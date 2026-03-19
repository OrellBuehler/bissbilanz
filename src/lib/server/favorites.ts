import { getDB } from '$lib/server/db';
import { foods, foodEntries, recipes, recipeIngredients } from '$lib/server/schema';
import { eq, sql, and, count, getTableColumns } from 'drizzle-orm';

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

	return results.map((r) => ({
		...r,
		type: 'food' as const,
		logCount: Number(r.logCount)
	}));
};

export const listFavoriteRecipes = async (userId: string, limit = 50) => {
	const db = getDB();

	const results = await db
		.select({
			id: recipes.id,
			name: recipes.name,
			imageUrl: recipes.imageUrl,
			totalServings: recipes.totalServings,
			logCount: count(foodEntries.id),
			calories: sql<number>`COALESCE(SUM(${foods.calories} * ${recipeIngredients.quantity} / ${foods.servingSize}) / NULLIF(${recipes.totalServings}, 0), 0)`,
			protein: sql<number>`COALESCE(SUM(${foods.protein} * ${recipeIngredients.quantity} / ${foods.servingSize}) / NULLIF(${recipes.totalServings}, 0), 0)`,
			carbs: sql<number>`COALESCE(SUM(${foods.carbs} * ${recipeIngredients.quantity} / ${foods.servingSize}) / NULLIF(${recipes.totalServings}, 0), 0)`,
			fat: sql<number>`COALESCE(SUM(${foods.fat} * ${recipeIngredients.quantity} / ${foods.servingSize}) / NULLIF(${recipes.totalServings}, 0), 0)`,
			fiber: sql<number>`COALESCE(SUM(${foods.fiber} * ${recipeIngredients.quantity} / ${foods.servingSize}) / NULLIF(${recipes.totalServings}, 0), 0)`
		})
		.from(recipes)
		.leftJoin(recipeIngredients, eq(recipes.id, recipeIngredients.recipeId))
		.leftJoin(foods, eq(recipeIngredients.foodId, foods.id))
		.leftJoin(
			foodEntries,
			and(eq(recipes.id, foodEntries.recipeId), eq(foodEntries.userId, userId))
		)
		.where(and(eq(recipes.userId, userId), eq(recipes.isFavorite, true)))
		.groupBy(recipes.id)
		.orderBy(sql`count(${foodEntries.id}) DESC`)
		.limit(limit);

	return results.map((r) => ({
		id: r.id,
		name: r.name,
		imageUrl: r.imageUrl,
		calories: Math.round(Number(r.calories)),
		protein: Math.round(Number(r.protein) * 10) / 10,
		carbs: Math.round(Number(r.carbs) * 10) / 10,
		fat: Math.round(Number(r.fat) * 10) / 10,
		fiber: Math.round(Number(r.fiber) * 10) / 10,
		type: 'recipe' as const,
		logCount: Number(r.logCount)
	}));
};
