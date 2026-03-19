import 'zod-openapi';
import { z } from 'zod';
import { servingUnitSchema } from '$lib/units';

export const recipeIngredientSchema = z
	.object({
		foodId: z.string().uuid(),
		quantity: z.coerce.number().positive(),
		servingUnit: servingUnitSchema
	})
	.meta({ id: 'RecipeIngredientInput' });

export const recipeCreateSchema = z
	.object({
		name: z.string().min(1),
		totalServings: z.coerce.number().positive(),
		ingredients: z.array(recipeIngredientSchema).min(1),
		isFavorite: z.boolean().optional(),
		imageUrl: z.string().optional().nullable()
	})
	.meta({ id: 'RecipeCreate' });

export const recipeUpdateSchema = recipeCreateSchema.partial().meta({ id: 'RecipeUpdate' });
