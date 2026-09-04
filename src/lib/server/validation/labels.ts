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

/**
 * `replace` swaps out everything this source wrote before; `extend` only adds.
 * Either way the 20-per-food cap is hard — labels that do not fit come back as
 * `dropped` instead of pushing existing ones out.
 */
export const labelWriteModeSchema = z.enum(['replace', 'extend']);

export const foodLabelsSetSchema = z
	.object({
		labels: labelsArraySchema,
		source: labelSourceSchema.optional(),
		confidence: confidenceSchema,
		mode: labelWriteModeSchema.optional()
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
		mode: labelWriteModeSchema.optional(),
		items: z.array(foodLabelsBatchItemSchema).min(1).max(MAX_BATCH_ITEMS)
	})
	.meta({ id: 'FoodLabelsBatch' });

/** Query filter for `GET /api/foods`: foods with fewer than this many labels. */
export const minLabelsSchema = z.coerce.number().int().min(1).max(MAX_LABELS_PER_FOOD);
