import 'zod-openapi';
import { z } from 'zod';
import { normalizeMealType } from '$lib/utils/meals';
import { paginationSchema } from './pagination';
import { aiTaskStatusValues } from '$lib/server/schema';

export const aiTaskSourceValues = ['web', 'ios', 'android'] as const;

/** A meal can be several photos — plated dish, packaging, nutrition label. */
export const MAX_AI_TASK_PHOTOS = 5;

const aiTaskPhotoUrlSchema = z.string().regex(/^\/uploads\/[a-f0-9-]+\.webp$/);

export const aiTaskCreateSchema = z
	.object({
		description: z.string().max(2000).optional().nullable(),
		// Superseded by photoUrls, kept so already-shipped mobile builds keep
		// working. When both arrive they are merged, first-come first-kept.
		photoUrl: aiTaskPhotoUrlSchema.optional().nullable(),
		photoUrls: z.array(aiTaskPhotoUrlSchema).max(MAX_AI_TASK_PHOTOS).optional().nullable(),
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		mealType: z.string().min(1).max(50).transform(normalizeMealType).optional(),
		eatenAt: z.string().datetime({ offset: true }).optional().nullable(),
		source: z.enum(aiTaskSourceValues).optional()
	})
	.meta({ id: 'AiTaskCreate' })
	.refine((val) => !!val.description || !!val.photoUrl || !!val.photoUrls?.length, {
		message: 'description or photoUrls is required'
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
		mealType: z.string().min(1).max(50).transform(normalizeMealType).optional(),
		eatenAt: z.string().datetime({ offset: true }).optional().nullable(),
		acknowledged: z.boolean().optional()
	})
	.meta({ id: 'AiTaskUpdate' });

export const aiTaskAcknowledgeSchema = z
	.object({
		ids: z.array(z.string().uuid()).max(100).optional()
	})
	.meta({ id: 'AiTaskAcknowledge' });

export const aiTaskListQuerySchema = paginationSchema
	.extend({
		status: z.enum(aiTaskStatusValues).optional(),
		acknowledged: z.stringbool().optional()
	})
	.meta({ id: 'AiTaskListQuery' });
