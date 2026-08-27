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

export const recipeCreateSchema = z
	.object({
		name: z.string().min(1).max(200),
		totalServings: z.coerce.number().positive(),
		ingredients: z.array(recipeIngredientSchema).min(1).max(100),
		isFavorite: z.boolean().optional(),
		imageUrl: imageUrlSchema.optional().nullable()
	})
	.meta({ id: 'RecipeCreate' });

export const recipeUpdateSchema = recipeCreateSchema.partial().meta({ id: 'RecipeUpdate' });
