import { z } from 'zod';
import { servingUnitValues } from '$lib/units';

export const foodCreateSchema = z.object({
	name: z.string().min(1),
	brand: z.string().optional().nullable(),
	servingSize: z.coerce.number().positive(),
	servingUnit: z.enum(servingUnitValues),
	calories: z.coerce.number().nonnegative(),
	protein: z.coerce.number().nonnegative(),
	carbs: z.coerce.number().nonnegative(),
	fat: z.coerce.number().nonnegative(),
	fiber: z.coerce.number().nonnegative(),
	// Advanced nutrients (optional)
	sodium: z.coerce.number().nonnegative().optional().nullable(),
	sugar: z.coerce.number().nonnegative().optional().nullable(),
	saturatedFat: z.coerce.number().nonnegative().optional().nullable(),
	cholesterol: z.coerce.number().nonnegative().optional().nullable(),
	vitaminA: z.coerce.number().nonnegative().optional().nullable(),
	vitaminC: z.coerce.number().nonnegative().optional().nullable(),
	calcium: z.coerce.number().nonnegative().optional().nullable(),
	iron: z.coerce.number().nonnegative().optional().nullable(),
	barcode: z.string().optional().nullable(),
	isFavorite: z.coerce.boolean().optional(),
	// Open Food Facts quality data
	nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).optional().nullable(),
	novaGroup: z.coerce.number().int().min(1).max(4).optional().nullable(),
	additives: z.array(z.string()).optional().nullable(),
	ingredientsText: z.string().optional().nullable(),
	imageUrl: z
		.string()
		.refine((val) => val.startsWith('/') || /^https?:\/\//.test(val), {
			message: 'Must be a relative path or absolute URL'
		})
		.optional()
		.nullable()
});

export const foodUpdateSchema = foodCreateSchema.partial();
