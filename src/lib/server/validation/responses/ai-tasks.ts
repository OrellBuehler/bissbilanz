import 'zod-openapi';
import { z } from 'zod';

const aiTaskStatusSchema = z.enum(['pending', 'completed', 'dismissed']);

const aiTaskSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		status: aiTaskStatusSchema,
		description: z.string().nullable(),
		photoUrl: z.string().nullable(),
		date: z.string(),
		mealType: z.string().nullable(),
		source: z.string().nullable(),
		resultSummary: z.string().nullable(),
		createdEntryIds: z.array(z.string()).nullable(),
		completedAt: z.string().nullable(),
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
		photoUrl: z.string()
	})
	.meta({ id: 'AiTaskPhotoResponse' });
