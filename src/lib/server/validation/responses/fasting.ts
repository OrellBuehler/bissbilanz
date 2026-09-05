import 'zod-openapi';
import { z } from 'zod';

const fastingSessionSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		startedAt: z.string(),
		endedAt: z.string(),
		targetHours: z.number().int(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional()
	})
	.meta({ id: 'FastingSession' });

export const fastingSessionsResponseSchema = z
	.object({
		sessions: z.array(fastingSessionSchema)
	})
	.meta({ id: 'FastingSessionsResponse' });

export const fastingSessionResponseSchema = z
	.object({
		session: fastingSessionSchema
	})
	.meta({ id: 'FastingSessionResponse' });
