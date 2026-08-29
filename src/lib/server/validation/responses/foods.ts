import 'zod-openapi';
import { z } from 'zod';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { servingUnitValues } from '$lib/units';
import { labelSourceValues } from '$lib/server/schema';

const optNutrient = z.number().nullable().optional();
const nutrientFields = Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, optNutrient]));

export const foodSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		name: z.string(),
		brand: z.string().nullable(),
		servingSize: z.number(),
		servingUnit: z.enum(servingUnitValues),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		...nutrientFields,
		barcode: z.string().nullable(),
		isFavorite: z.boolean().default(false),
		nutriScore: z.string().nullable(),
		novaGroup: z.number().int().nullable(),
		additives: z.array(z.string()).nullable(),
		ingredientsText: z.string().nullable(),
		imageUrl: z.string().nullable(),
		// General en_US nouns describing what the food physically is, as a camera
		// would see it. Flattened server-side from the food_labels table (sorted,
		// deduped, sources collapsed) so clients see one more scalar-ish field.
		// Optional rather than required: not every food-returning path aggregates
		// them, and a missing key must not break a generated client's decode.
		labels: z.array(z.string()).nullable().optional(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional()
	})
	.meta({ id: 'Food' });

const recentFoodSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		name: z.string(),
		brand: z.string().nullable(),
		servingSize: z.number(),
		servingUnit: z.enum(servingUnitValues),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		barcode: z.string().nullable(),
		isFavorite: z.boolean(),
		imageUrl: z.string().nullable(),
		// Servings used in the most recent log entry of this food, so the log
		// dialog can prefill the amount instead of defaulting to one serving.
		lastServings: z.number(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional()
	})
	.meta({ id: 'FoodRecent' });

export const foodsListResponseSchema = z
	.object({
		foods: z.array(foodSchema),
		total: z.number().int()
	})
	.meta({ id: 'FoodsListResponse' });

export const foodResponseSchema = z
	.object({
		food: foodSchema
	})
	.meta({ id: 'FoodResponse' });

export const foodsRecentResponseSchema = z
	.object({
		foods: z.array(recentFoodSchema)
	})
	.meta({ id: 'FoodsRecentResponse' });

export const foodDuplicateFoodSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string(),
		brand: z.string().nullable(),
		barcode: z.string().nullable()
	})
	.meta({ id: 'FoodDuplicateFood' });

export const foodDuplicateGroupSchema = z
	.object({
		reason: z.enum(['barcode', 'name_brand']),
		key: z.string(),
		foods: z.array(foodDuplicateFoodSchema)
	})
	.meta({ id: 'FoodDuplicateGroup' });

export const foodDuplicatesResponseSchema = z
	.object({
		groups: z.array(foodDuplicateGroupSchema)
	})
	.meta({ id: 'FoodDuplicatesResponse' });

export const foodLabelDetailSchema = z
	.object({
		label: z.string(),
		source: z.enum(labelSourceValues),
		confidence: z.number().nullable(),
		createdAt: z.string().nullable()
	})
	.meta({ id: 'FoodLabelDetail' });

export const foodLabelsResponseSchema = z
	.object({
		labels: z.array(foodLabelDetailSchema)
	})
	.meta({ id: 'FoodLabelsResponse' });

export const foodLabelsSetResponseSchema = z
	.object({
		labels: z.array(z.string())
	})
	.meta({ id: 'FoodLabelsSetResponse' });

export const foodLabelsBatchItemResultSchema = z
	.object({
		foodId: z.string().uuid(),
		ok: z.boolean(),
		labels: z.array(z.string()).optional(),
		error: z.string().optional()
	})
	.meta({ id: 'FoodLabelsBatchItemResult' });

export const foodLabelsBatchResponseSchema = z
	.object({
		results: z.array(foodLabelsBatchItemResultSchema)
	})
	.meta({ id: 'FoodLabelsBatchResponse' });
