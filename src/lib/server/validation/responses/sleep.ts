import 'zod-openapi';
import { z } from 'zod';

const sleepEntrySchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		entryDate: z.string(),
		durationMinutes: z.number().int(),
		quality: z.number().int(),
		bedtime: z.string().nullable(),
		wakeTime: z.string().nullable(),
		wakeUps: z.number().int().nullable(),
		sleepLatencyMinutes: z.number().int().nullable(),
		deepSleepMinutes: z.number().int().nullable(),
		lightSleepMinutes: z.number().int().nullable(),
		remSleepMinutes: z.number().int().nullable(),
		source: z.string().nullable(),
		notes: z.string().nullable(),
		loggedAt: z.string().optional(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional()
	})
	.meta({ id: 'SleepEntry' });

export const sleepEntriesResponseSchema = z
	.object({
		entries: z.array(sleepEntrySchema)
	})
	.meta({ id: 'SleepEntriesResponse' });

export const sleepEntryResponseSchema = z
	.object({
		entry: sleepEntrySchema
	})
	.meta({ id: 'SleepEntryResponse' });
