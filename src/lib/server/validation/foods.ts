import 'zod-openapi';
import { z } from 'zod';
import { servingUnitSchema } from '$lib/units';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

const optNutrient = z.coerce.number().nonnegative().optional().nullable();

/**
 * Either an app-relative path or an absolute http(s) URL. `//host/x` is rejected:
 * it passes a bare `startsWith('/')` check but is a protocol-relative URL that
 * loads from an arbitrary third-party origin.
 */
export const imageUrlSchema = z
	.string()
	.max(2048)
	.refine((val) => (val.startsWith('/') && !val.startsWith('//')) || /^https?:\/\//.test(val), {
		message: 'Must be a relative path or absolute URL'
	});

/** Build the nutrient fields object from the catalog */
const nutrientFields = Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, optNutrient]));

export const foodCreateSchema = z
	.object({
		name: z.string().min(1).max(200),
		brand: z.string().max(200).optional().nullable(),
		servingSize: z.coerce.number().positive(),
		servingUnit: servingUnitSchema,
		calories: z.coerce.number().nonnegative(),
		protein: z.coerce.number().nonnegative(),
		carbs: z.coerce.number().nonnegative(),
		fat: z.coerce.number().nonnegative(),
		fiber: z.coerce.number().nonnegative(),
		// All extended nutrients (derived from catalog)
		...nutrientFields,
		barcode: z.string().max(64).optional().nullable(),
		isFavorite: z.coerce.boolean().optional(),
		// Open Food Facts quality data
		nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).optional().nullable(),
		novaGroup: z.coerce.number().int().min(1).max(4).optional().nullable(),
		additives: z.array(z.string().max(100)).max(100).optional().nullable(),
		ingredientsText: z.string().max(10000).optional().nullable(),
		imageUrl: imageUrlSchema.optional().nullable(),
		// Input only: raw Open Food Facts `categories_tags` as returned by the
		// proxy. Never stored on the food — the server derives `catalog` labels
		// from them and discards the rest.
		categoriesTags: z.array(z.string().max(200)).max(100).optional()
	})
	.meta({ id: 'FoodCreate' });

export const foodUpdateSchema = foodCreateSchema.partial().meta({ id: 'FoodUpdate' });

export const foodMergeSchema = z
	.object({
		keeperId: z.string().uuid(),
		sourceIds: z.array(z.string().uuid()).min(1).max(20),
		overrides: foodCreateSchema.partial().optional()
	})
	.meta({ id: 'FoodMerge' });
