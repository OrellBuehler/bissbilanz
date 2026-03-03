import { z } from 'zod';
import { servingUnitValues } from '$lib/units';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

const optNutrient = z.coerce.number().nonnegative().optional().nullable();

/** Build the nutrient fields object from the catalog */
const nutrientFields = Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, optNutrient]));

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
	// All extended nutrients (derived from catalog)
	...nutrientFields,
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
