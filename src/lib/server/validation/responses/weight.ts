import 'zod-openapi';
import { z } from 'zod';

const weightEntrySchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		weightKg: z.number(),
		entryDate: z.string(),
		loggedAt: z.string().optional(),
		notes: z.string().nullable(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional()
	})
	.meta({ id: 'WeightEntry' });

const trendEntrySchema = z
	.object({
		entry_date: z.string(),
		weight_kg: z.number(),
		moving_avg: z.number()
	})
	.meta({ id: 'WeightTrendEntry' });

export const weightEntriesResponseSchema = z
	.object({
		entries: z.array(weightEntrySchema)
	})
	.meta({ id: 'WeightEntriesResponse' });

export const weightEntryResponseSchema = z
	.object({
		entry: weightEntrySchema
	})
	.meta({ id: 'WeightEntryResponse' });

export const weightLatestResponseSchema = z
	.object({
		entry: weightEntrySchema.nullable()
	})
	.meta({ id: 'WeightLatestResponse' });

export const weightTrendResponseSchema = z
	.object({
		data: z.array(trendEntrySchema)
	})
	.meta({ id: 'WeightTrendResponse' });
