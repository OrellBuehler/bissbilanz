import 'zod-openapi';
import { z } from 'zod';

export const sleepCreateSchema = z
	.object({
		durationMinutes: z.coerce.number().int().positive().max(1440),
		quality: z.coerce.number().int().min(1).max(10),
		entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		bedtime: z.string().datetime().optional().nullable(),
		wakeTime: z.string().datetime().optional().nullable(),
		wakeUps: z.coerce.number().int().min(0).optional().nullable(),
		notes: z.string().max(2000).optional().nullable()
	})
	.meta({ id: 'SleepCreate' });

export const sleepUpdateSchema = z
	.object({
		durationMinutes: z.coerce.number().int().positive().max(1440).optional(),
		quality: z.coerce.number().int().min(1).max(10).optional(),
		entryDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		bedtime: z.string().datetime().optional().nullable(),
		wakeTime: z.string().datetime().optional().nullable(),
		wakeUps: z.coerce.number().int().min(0).optional().nullable(),
		notes: z.string().max(2000).optional().nullable()
	})
	.meta({ id: 'SleepUpdate' });
