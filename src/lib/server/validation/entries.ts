import { z } from 'zod';
import { normalizeMealType } from '$lib/utils/meals';

const entryBaseSchema = z.object({
	foodId: z.string().uuid().optional(),
	recipeId: z.string().uuid().optional(),
	mealType: z.string().min(1).transform(normalizeMealType),
	servings: z.coerce.number().positive(),
	notes: z.string().optional().nullable(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	quickName: z.string().optional().nullable(),
	quickCalories: z.coerce.number().nonnegative().optional().nullable(),
	quickProtein: z.coerce.number().nonnegative().optional().nullable(),
	quickCarbs: z.coerce.number().nonnegative().optional().nullable(),
	quickFat: z.coerce.number().nonnegative().optional().nullable(),
	quickFiber: z.coerce.number().nonnegative().optional().nullable()
});

export const entryCreateSchema = entryBaseSchema.refine(
	(val) => val.foodId || val.recipeId || val.quickCalories != null,
	{ message: 'foodId, recipeId, or quickCalories is required' }
);

export const entryUpdateSchema = entryBaseSchema.partial();
