import 'zod-openapi';
import { z } from 'zod';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

const optNutrient = z.number().nullable().optional();
const nutrientFields = Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, optNutrient]));

const productSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		brand: z.string().nullable(),
		barcode: z.string(),
		imageUrl: z.string().nullable(),
		nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).nullable(),
		novaGroup: z.number().nullable(),
		servingSize: z.number().nullable(),
		servingUnit: z.string().nullable(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		...nutrientFields,
		additives: z.array(z.string()).nullable(),
		ingredientsText: z.string().nullable()
	})
	.meta({ id: 'OpenFoodFactsProduct' });

export const openfoodfactsResponseSchema = z
	.object({
		product: productSchema
	})
	.meta({ id: 'OpenFoodFactsResponse' });
