import { getDB } from '$lib/server/db';
import { foods, recipes, recipeIngredients } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';

export const buildRecipeMacrosCte = (db: ReturnType<typeof getDB>, userId: string) =>
	db.$with('recipe_macros').as(
		db
			.select({
				recipeId: recipeIngredients.recipeId,
				rmCalories:
					sql<number>`SUM(${foods.calories} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_calories'
					),
				rmProtein:
					sql<number>`SUM(${foods.protein} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_protein'
					),
				rmCarbs:
					sql<number>`SUM(${foods.carbs} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_carbs'
					),
				rmFat:
					sql<number>`SUM(${foods.fat} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_fat'
					),
				rmFiber:
					sql<number>`SUM(${foods.fiber} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
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
