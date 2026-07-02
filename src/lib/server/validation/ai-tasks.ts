import 'zod-openapi';
import { z } from 'zod';
import { normalizeMealType } from '$lib/utils/meals';
import { paginationSchema } from './pagination';
import { aiTaskStatusValues } from '$lib/server/schema';

export const aiTaskSourceValues = ['web', 'ios', 'android'] as const;

export const aiTaskCreateSchema = z
	.object({
		description: z.string().max(2000).optional().nullable(),
		photoUrl: z
			.string()
			.regex(/^\/uploads\/[a-f0-9-]+\.webp$/)
			.optional()
			.nullable(),
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		mealType: z.string().min(1).max(50).transform(normalizeMealType).optional(),
		source: z.enum(aiTaskSourceValues).optional()
	})
	.meta({ id: 'AiTaskCreate' })
	.refine((val) => !!val.description || !!val.photoUrl, {
		message: 'description or photoUrl is required'
	});

export const aiTaskUpdateSchema = z
	.object({
		status: z.enum(aiTaskStatusValues).optional(),
		resultSummary: z.string().max(2000).optional().nullable(),
		createdEntryIds: z.array(z.string().min(1)).max(50).optional().nullable(),
		description: z.string().max(2000).optional().nullable(),
		date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		mealType: z.string().min(1).max(50).transform(normalizeMealType).optional()
	})
	.meta({ id: 'AiTaskUpdate' });

export const aiTaskListQuerySchema = paginationSchema
	.extend({
		status: z.enum(aiTaskStatusValues).optional()
	})
	.meta({ id: 'AiTaskListQuery' });
