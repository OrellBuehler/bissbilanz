import 'zod-openapi';
import { z } from 'zod';
import { labelSourceValues } from '$lib/server/schema';
import { MAX_BATCH_ITEMS, MAX_LABELS_PER_FOOD } from '$lib/server/labels';

export const labelSourceSchema = z.enum(labelSourceValues);

/**
 * Bounds the raw input only. The stored form is whatever `normalizeLabel()`
 * makes of it (or nothing at all, if it rejects the value), so this cap is
 * deliberately looser than the 40-character normalized limit.
 */
const rawLabelSchema = z.string().min(1).max(120);

const labelsArraySchema = z.array(rawLabelSchema).max(MAX_LABELS_PER_FOOD);

const confidenceSchema = z.coerce.number().min(0).max(1).optional().nullable();

export const foodLabelsSetSchema = z
	.object({
		labels: labelsArraySchema,
		source: labelSourceSchema.optional(),
		confidence: confidenceSchema
	})
	.meta({ id: 'FoodLabelsSet' });

export const foodLabelsBatchItemSchema = z
	.object({
		foodId: z.string().uuid(),
		labels: labelsArraySchema
	})
	.meta({ id: 'FoodLabelsBatchItem' });

export const foodLabelsBatchSchema = z
	.object({
		source: labelSourceSchema.optional(),
		confidence: confidenceSchema,
		items: z.array(foodLabelsBatchItemSchema).min(1).max(MAX_BATCH_ITEMS)
	})
	.meta({ id: 'FoodLabelsBatch' });
