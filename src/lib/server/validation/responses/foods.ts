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
		// When the food was last logged, and how often it has been logged at all.
		lastUsedAt: z.string().nullable(),
		logCount: z.number().int(),
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
		labels: z.array(z.string()),
		// Labels that did not fit under the per-food cap next to what was already
		// stored. Never silently trimmed, so a client can tell the user.
		dropped: z.array(z.string())
	})
	.meta({ id: 'FoodLabelsSetResponse' });

export const foodLabelStatSchema = z
	.object({
		label: z.string(),
		count: z.number().int()
	})
	.meta({ id: 'FoodLabelStat' });

export const foodLabelStatsResponseSchema = z
	.object({
		labels: z.array(foodLabelStatSchema)
	})
	.meta({ id: 'FoodLabelStatsResponse' });

export const foodLabelsBatchItemResultSchema = z
	.object({
		foodId: z.string().uuid(),
		ok: z.boolean(),
		labels: z.array(z.string()).optional(),
		dropped: z.array(z.string()).optional(),
		error: z.string().optional()
	})
	.meta({ id: 'FoodLabelsBatchItemResult' });

export const foodLabelsBatchResponseSchema = z
	.object({
		results: z.array(foodLabelsBatchItemResultSchema)
	})
	.meta({ id: 'FoodLabelsBatchResponse' });

export const foodBatchResultSchema = z
	.object({
		id: z.string().uuid(),
		ok: z.boolean(),
		error: z.string().optional(),
		// `delete` only: the food is still referenced by diary entries and was
		// left alone. Retry with `force` to delete those entries too.
		entryCount: z.number().int().optional()
	})
	.meta({ id: 'FoodBatchResult' });

export const foodBatchResponseSchema = z
	.object({
		results: z.array(foodBatchResultSchema),
		succeeded: z.number().int(),
		failed: z.number().int()
	})
	.meta({ id: 'FoodBatchResponse' });

export const foodImportSkippedSchema = z
	.object({
		index: z.number().int(),
		name: z.string(),
		reason: z.enum(['duplicate', 'duplicate_barcode'])
	})
	.meta({ id: 'FoodImportSkipped' });

export const foodImportResponseSchema = z
	.object({
		foods: z.array(foodSchema),
		created: z.number().int(),
		skipped: z.array(foodImportSkippedSchema)
	})
	.meta({ id: 'FoodImportResponse' });
