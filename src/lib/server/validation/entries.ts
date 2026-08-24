import 'zod-openapi';
import { z } from 'zod';
import { normalizeMealType } from '$lib/utils/meals';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

const quickNutrientsSchema = z
	.record(z.string(), z.coerce.number().nonnegative())
	.refine((rec) => Object.keys(rec).every((key) => ALL_NUTRIENT_KEYS.includes(key)), {
		message: 'Invalid nutrient key'
	});

export const entryBaseSchema = z.object({
	foodId: z.string().uuid().optional(),
	recipeId: z.string().uuid().optional(),
	mealType: z.string().min(1).max(50).transform(normalizeMealType),
	servings: z.coerce.number().positive(),
	notes: z.string().optional().nullable(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	quickName: z.string().optional().nullable(),
	quickCalories: z.coerce.number().nonnegative().optional().nullable(),
	quickProtein: z.coerce.number().nonnegative().optional().nullable(),
	quickCarbs: z.coerce.number().nonnegative().optional().nullable(),
	quickFat: z.coerce.number().nonnegative().optional().nullable(),
	quickFiber: z.coerce.number().nonnegative().optional().nullable(),
	quickNutrients: quickNutrientsSchema.optional().nullable(),
	eatenAt: z.string().datetime({ offset: true }).optional()
});

export const entryCreateSchema = entryBaseSchema
	.meta({ id: 'EntryCreate' })
	.refine(
		(val) => val.foodId || val.recipeId || (val.quickCalories != null && val.quickCalories > 0),
		{ message: 'foodId, recipeId, or quickCalories (> 0) is required' }
	);

export const entryUpdateSchema = entryBaseSchema.partial().meta({ id: 'EntryUpdate' });
