import 'zod-openapi';
import { z } from 'zod';
import { servingUnitSchema } from '$lib/units';
import { imageUrlSchema } from './foods';

export const recipeIngredientSchema = z
	.object({
		foodId: z.string().uuid(),
		quantity: z.coerce.number().positive(),
		servingUnit: servingUnitSchema
	})
	.meta({ id: 'RecipeIngredientInput' });

export const MAX_RECIPE_STEPS = 50;
export const MAX_RECIPE_STEP_TEXT = 2000;

export const recipeStepSchema = z
	.object({
		text: z.string().trim().min(1).max(MAX_RECIPE_STEP_TEXT),
		// `/uploads/...` path from POST /api/images/upload (purpose=recipe_step) or an
		// absolute URL, like the recipe's own imageUrl.
		imageUrl: imageUrlSchema.optional().nullable()
	})
	.meta({ id: 'RecipeStepInput' });

export const recipeCreateSchema = z
	.object({
		name: z.string().min(1).max(200),
		totalServings: z.coerce.number().positive(),
		ingredients: z.array(recipeIngredientSchema).min(1).max(100),
		isFavorite: z.boolean().optional(),
		imageUrl: imageUrlSchema.optional().nullable(),
		// Grams of the finished dish (optional) — lets an entry be logged by
		// weight instead of by serving count.
		cookedWeight: z.coerce.number().positive().optional().nullable(),
		// Optional ordered cooking instructions. On update, a present list replaces
		// all steps (an empty list clears them); omitted leaves them unchanged.
		steps: z.array(recipeStepSchema).max(MAX_RECIPE_STEPS).optional()
	})
	.meta({ id: 'RecipeCreate' });

export const recipeUpdateSchema = recipeCreateSchema.partial().meta({ id: 'RecipeUpdate' });
