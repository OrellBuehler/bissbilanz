import 'zod-openapi';
import { z } from 'zod';

const instantSchema = z.string().datetime({ offset: true });
const targetHoursSchema = z.coerce.number().int().min(1).max(168);

const rangeValid = (data: { startedAt?: string; endedAt?: string }) =>
	!data.startedAt || !data.endedAt || new Date(data.endedAt) > new Date(data.startedAt);

export const fastingSessionUpsertSchema = z
	.object({
		id: z.string().uuid().optional(),
		startedAt: instantSchema,
		endedAt: instantSchema,
		targetHours: targetHoursSchema
	})
	.refine(rangeValid, { message: 'endedAt must be after startedAt', path: ['endedAt'] })
	.meta({ id: 'FastingSessionUpsert' });

export const fastingSessionUpdateSchema = z
	.object({
		startedAt: instantSchema.optional(),
		endedAt: instantSchema.optional(),
		targetHours: targetHoursSchema.optional()
	})
	.refine(rangeValid, { message: 'endedAt must be after startedAt', path: ['endedAt'] })
	.meta({ id: 'FastingSessionUpdate' });
