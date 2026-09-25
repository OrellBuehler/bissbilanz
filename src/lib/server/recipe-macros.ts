import { getDB } from '$lib/server/db';
import { foods, recipes, recipeIngredients } from '$lib/server/schema';
import { eq, sql, type SQLWrapper } from 'drizzle-orm';

/**
 * Grams (mass) or milliliters (volume) represented by one unit of a
 * `serving_unit` value, as a SQL `CASE` expression. Mirrors the factors in
 * `$lib/units` (`UNIT_BASE`) — keep both in sync.
 */
const unitBaseSql = (unitColumn: SQLWrapper) => sql`(CASE ${unitColumn}
		WHEN 'g' THEN 1
		WHEN 'kg' THEN 1000
		WHEN 'oz' THEN 28.349523125
		WHEN 'lb' THEN 453.59237
		WHEN 'ml' THEN 1
		WHEN 'cl' THEN 10
		WHEN 'l' THEN 1000
		WHEN 'fl_oz' THEN 29.5735295625
		WHEN 'cup' THEN 240
		WHEN 'tbsp' THEN 15
		WHEN 'tsp' THEN 5
	END)`;

const isVolumeUnitSql = (unitColumn: SQLWrapper) =>
	sql`(${unitColumn} IN ('ml', 'cl', 'l', 'fl_oz', 'cup', 'tbsp', 'tsp'))`;

/**
 * A recipe ingredient's quantity, converted into the food's own serving unit.
 * When the ingredient and food units are in different dimensions (mass vs.
 * volume) — only possible for legacy rows that predate unit-aware validation
 * — the quantity is used as-is, matching the pre-conversion behavior.
 */
export const convertedIngredientQuantitySql = sql<number>`(CASE
		WHEN ${isVolumeUnitSql(recipeIngredients.servingUnit)} = ${isVolumeUnitSql(foods.servingUnit)}
		THEN ${recipeIngredients.quantity} * ${unitBaseSql(recipeIngredients.servingUnit)} / ${unitBaseSql(foods.servingUnit)}
		ELSE ${recipeIngredients.quantity}
	END)`;

export const buildRecipeMacrosCte = (db: ReturnType<typeof getDB>, userId: string) =>
	db.$with('recipe_macros').as(
		db
			.select({
				recipeId: recipeIngredients.recipeId,
				rmCalories:
					sql<number>`SUM(${foods.calories} * ${convertedIngredientQuantitySql} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_calories'
					),
				rmProtein:
					sql<number>`SUM(${foods.protein} * ${convertedIngredientQuantitySql} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_protein'
					),
				rmCarbs:
					sql<number>`SUM(${foods.carbs} * ${convertedIngredientQuantitySql} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_carbs'
					),
				rmFat:
					sql<number>`SUM(${foods.fat} * ${convertedIngredientQuantitySql} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_fat'
					),
				rmFiber:
					sql<number>`SUM(${foods.fiber} * ${convertedIngredientQuantitySql} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_fiber'
					)
			})
			.from(recipeIngredients)
			.innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
			.innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
			.where(eq(recipes.userId, userId))
			.groupBy(recipeIngredients.recipeId, recipes.totalServings)
	);

export type RecipeMacrosCte = ReturnType<typeof buildRecipeMacrosCte>;
