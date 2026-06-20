import { z } from 'zod';
import { servingUnitSchema } from '$lib/units';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

const optNutrient = z.coerce.number().nonnegative().optional().nullable();
const nutrientFields = Object.fromEntries(ALL_NUTRIENT_KEYS.map((k) => [k, optNutrient]));

export const datasetHeaderSchema = z.object({
	_dataset: z.object({
		key: z
			.string()
			.min(1)
			.max(64)
			.regex(/^[a-z0-9-]+$/),
		name: z.string().min(1).max(200),
		source: z.enum(['migros', 'off', 'coop']),
		priority: z.coerce.number().int().min(0).max(1000),
		version: z.string().max(64).optional().nullable(),
		snapshotAt: z.string().datetime().optional().nullable()
	})
});

export const datasetProductSchema = z.object({
	name: z.string().min(1).max(500),
	brand: z.string().max(500).optional().nullable(),
	language: z.enum(['de', 'fr', 'it', 'en']).optional().nullable(),
	servingSize: z.coerce.number().positive(),
	servingUnit: servingUnitSchema,
	calories: z.coerce.number().nonnegative(),
	protein: z.coerce.number().nonnegative(),
	carbs: z.coerce.number().nonnegative(),
	fat: z.coerce.number().nonnegative(),
	fiber: z.coerce.number().nonnegative(),
	...nutrientFields,
	barcode: z.string().max(32).optional().nullable(),
	nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).optional().nullable(),
	novaGroup: z.coerce.number().int().min(1).max(4).optional().nullable(),
	additives: z.array(z.string().max(100)).max(200).optional().nullable(),
	ingredientsText: z.string().max(10000).optional().nullable(),
	imageUrl: z.string().url().max(2000).optional().nullable(),
	sourceUrl: z.string().url().max(2000).optional().nullable(),
	sourceRef: z.string().max(200).optional().nullable(),
	crawledAt: z.string().datetime().optional().nullable()
});

export type DatasetHeader = z.infer<typeof datasetHeaderSchema>;
export type DatasetProduct = z.infer<typeof datasetProductSchema>;
