import { z } from 'zod';

export const foodCreateSchema = z.object({
	name: z.string().min(1),
	brand: z.string().optional().nullable(),
	servingSize: z.coerce.number().positive(),
	servingUnit: z.string().min(1),
	calories: z.coerce.number().nonnegative(),
	protein: z.coerce.number().nonnegative(),
	carbs: z.coerce.number().nonnegative(),
	fat: z.coerce.number().nonnegative(),
	fiber: z.coerce.number().nonnegative(),
	barcode: z.string().optional().nullable(),
	isFavorite: z.coerce.boolean().optional()
});

export const foodUpdateSchema = foodCreateSchema.partial();
