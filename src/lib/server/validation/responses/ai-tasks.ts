import 'zod-openapi';
import { z } from 'zod';
import { aiTaskStatusValues } from '$lib/server/schema';

const aiTaskStatusSchema = z.enum(aiTaskStatusValues);

const aiTaskSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		status: aiTaskStatusSchema,
		description: z.string().nullable(),
		// Kept for already-shipped mobile builds: mirrors photoUrls[0].
		photoUrl: z.string().nullable(),
		photoUrls: z.array(z.string()),
		date: z.string(),
		mealType: z.string().nullable(),
		eatenAt: z.string().nullable(),
		source: z.string().nullable(),
		resultSummary: z.string().nullable(),
		createdEntryIds: z.array(z.string()).nullable(),
		completedAt: z.string().nullable(),
		dismissedAt: z.string().nullable(),
		acknowledgedAt: z.string().nullable(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional()
	})
	.meta({ id: 'AiTask' });

export const aiTaskResponseSchema = z
	.object({
		task: aiTaskSchema
	})
	.meta({ id: 'AiTaskResponse' });

export const aiTasksResponseSchema = z
	.object({
		tasks: z.array(aiTaskSchema),
		total: z.number().int()
	})
	.meta({ id: 'AiTasksResponse' });

export const aiTaskPhotoResponseSchema = z
	.object({
		// Mirrors photoUrls[0], for clients that only upload one photo at a time.
		photoUrl: z.string(),
		photoUrls: z.array(z.string())
	})
	.meta({ id: 'AiTaskPhotoResponse' });

export const aiTaskAcknowledgeResponseSchema = z
	.object({
		acknowledged: z.number().int()
	})
	.meta({ id: 'AiTaskAcknowledgeResponse' });
