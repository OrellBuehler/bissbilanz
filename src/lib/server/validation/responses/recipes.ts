import 'zod-openapi';
import { z } from 'zod';
import { servingUnitValues } from '$lib/units';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

const extendedNutrientsSchema = z
	.object(Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, z.number().nullable()])))
	.meta({ id: 'RecipeExtendedNutrients' });

const recipeSummarySchema = z
	.object({
		id: z.string().uuid(),
		name: z.string(),
		totalServings: z.number(),
		isFavorite: z.boolean(),
		imageUrl: z.string().nullable(),
		cookedWeight: z.number().nullable().optional(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		// Number of cooking steps, for a "has instructions" badge. Always sent by
		// the server; optional so cached copies from older builds still decode.
		stepCount: z.number().int().optional()
	})
	.meta({ id: 'RecipeSummary' });

const recipeStepResponseSchema = z
	.object({
		id: z.string().uuid(),
		sortOrder: z.number().int(),
		text: z.string(),
		imageUrl: z.string().nullable()
	})
	.meta({ id: 'RecipeStep' });

const recipeIngredientResponseSchema = z
	.object({
		id: z.string().uuid().optional(),
		recipeId: z.string().uuid().optional(),
		foodId: z.string().uuid(),
		quantity: z.number(),
		servingUnit: z.enum(servingUnitValues),
		sortOrder: z.number().int()
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
		cookedWeight: z.number().nullable().optional(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
		ingredients: z.array(recipeIngredientResponseSchema),
		// Ordered cooking steps (possibly empty). Always sent by the server; optional
		// so recipe copies cached by older builds still decode.
		steps: z.array(recipeStepResponseSchema).optional(),
		// Per-serving (unlike the whole-recipe core macros above), to match
		// what a food's nutrient panel shows.
		extendedNutrientsPerServing: extendedNutrientsSchema.optional()
	})
	.meta({ id: 'RecipeDetail' });

export const recipesListResponseSchema = z
	.object({
		recipes: z.array(recipeSummarySchema),
		total: z.number().int()
	})
	.meta({ id: 'RecipesListResponse' });

export const recipeResponseSchema = z
	.object({
		recipe: recipeDetailSchema
	})
	.meta({ id: 'RecipeResponse' });
