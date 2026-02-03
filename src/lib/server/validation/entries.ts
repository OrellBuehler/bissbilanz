import { z } from 'zod';

const entryBaseSchema = z.object({
	foodId: z.string().uuid().optional(),
	recipeId: z.string().uuid().optional(),
	mealType: z.string().min(1),
	servings: z.coerce.number().positive(),
	notes: z.string().optional().nullable(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const entryCreateSchema = entryBaseSchema.refine((val) => val.foodId || val.recipeId, {
	message: 'foodId or recipeId is required'
});

export const entryUpdateSchema = entryBaseSchema.partial();
