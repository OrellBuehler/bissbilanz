import 'zod-openapi';
import { z } from 'zod';

const sleepEntrySchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		entryDate: z.string(),
		durationMinutes: z.number(),
		quality: z.number(),
		bedtime: z.string().nullable(),
		wakeTime: z.string().nullable(),
		wakeUps: z.number().nullable(),
		sleepLatencyMinutes: z.number().nullable(),
		deepSleepMinutes: z.number().nullable(),
		lightSleepMinutes: z.number().nullable(),
		remSleepMinutes: z.number().nullable(),
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
