import 'zod-openapi';
import { z } from 'zod';

/**
 * Accept offset-form ISO-8601 ('...+02:00'), not just UTC 'Z'. Plain `.datetime()`
 * is Zulu-only, so a mobile client sending a local-offset instant got a 400 — and
 * the offline sync queue dead-letters 4xx permanently, silently losing the edit.
 * Matches the `eatenAt` contract on entries.
 */
const instantSchema = z.string().datetime({ offset: true });

export const sleepCreateSchema = z
	.object({
		durationMinutes: z.coerce.number().int().positive().max(1440),
		quality: z.coerce.number().min(1).max(10),
		entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		bedtime: instantSchema.optional().nullable(),
		wakeTime: instantSchema.optional().nullable(),
		wakeUps: z.coerce.number().int().min(0).optional().nullable(),
		notes: z.string().max(2000).optional().nullable()
	})
	.meta({ id: 'SleepCreate' });

export const sleepUpdateSchema = z
	.object({
		durationMinutes: z.coerce.number().int().positive().max(1440).optional(),
		quality: z.coerce.number().min(1).max(10).optional(),
		entryDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		bedtime: instantSchema.optional().nullable(),
		wakeTime: instantSchema.optional().nullable(),
		wakeUps: z.coerce.number().int().min(0).optional().nullable(),
		notes: z.string().max(2000).optional().nullable()
	})
	.meta({ id: 'SleepUpdate' });
