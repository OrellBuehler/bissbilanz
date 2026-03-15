import 'zod-openapi';
import { z } from 'zod';

const recipeSummarySchema = z
	.object({
		id: z.string().uuid(),
		name: z.string(),
		totalServings: z.number(),
		isFavorite: z.boolean(),
		imageUrl: z.string().nullable(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number()
	})
	.meta({ id: 'RecipeSummary' });

const recipeIngredientResponseSchema = z
	.object({
		id: z.string().uuid(),
		recipeId: z.string().uuid(),
		foodId: z.string().uuid(),
		quantity: z.number(),
		servingUnit: z.string(),
		sortOrder: z.number()
	})
	.meta({ id: 'RecipeIngredient' });

const recipeDetailSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		name: z.string(),
		totalServings: z.number(),
		isFavorite: z.boolean(),
		imageUrl: z.string().nullable(),
		createdAt: z.string(),
		updatedAt: z.string(),
		ingredients: z.array(recipeIngredientResponseSchema)
	})
	.meta({ id: 'RecipeDetail' });

export const recipesListResponseSchema = z
	.object({
		recipes: z.array(recipeSummarySchema),
		total: z.number()
	})
	.meta({ id: 'RecipesListResponse' });

export const recipeResponseSchema = z
	.object({
		recipe: recipeDetailSchema
	})
	.meta({ id: 'RecipeResponse' });
