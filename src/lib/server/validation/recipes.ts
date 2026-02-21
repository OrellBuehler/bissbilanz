import { z } from 'zod';

export const recipeIngredientSchema = z.object({
	foodId: z.string().uuid(),
	quantity: z.coerce.number().positive(),
	servingUnit: z.string().min(1)
});

export const recipeCreateSchema = z.object({
	name: z.string().min(1),
	totalServings: z.coerce.number().positive(),
	ingredients: z.array(recipeIngredientSchema).min(1),
	isFavorite: z.boolean().optional(),
	imageUrl: z.string().optional().nullable()
});

export const recipeUpdateSchema = recipeCreateSchema.partial();
