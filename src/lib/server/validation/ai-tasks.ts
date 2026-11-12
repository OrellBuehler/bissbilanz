import 'zod-openapi';
import { z } from 'zod';
import { normalizeMealType } from '$lib/utils/meals';
import { paginationSchema } from './pagination';
import { aiTaskStatusValues, aiTaskProcessedByValues } from '$lib/server/schema';

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
		photoUrls: z.array(aiTaskPhotoUrlSchema).max(MAX_AI_TASK_PHOTOS).optional(),
		date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		mealType: z.string().min(1).max(50).transform(normalizeMealType).optional().nullable(),
		eatenAt: z.string().datetime({ offset: true }).optional().nullable(),
		acknowledged: z.boolean().optional(),
		processedBy: z.enum(aiTaskProcessedByValues).optional()
	})
	.meta({ id: 'AiTaskUpdate' });

export const aiTaskAcknowledgeSchema = z
	.object({
		ids: z.array(z.string().uuid()).max(100).optional(),
		replyIds: z.array(z.string().uuid()).max(100).optional().meta({
			description:
				"Ids of Claude's answers (claudeThread messages) the client has shown, to mark as read. Only the named messages change, so an answer that arrived after the client's last read stays unread. Independent of `ids`."
		})
	})
	.meta({ id: 'AiTaskAcknowledge' });

/** A reply corrects one meal; a longer text is not a correction any more. */
export const AI_TASK_REPLY_MAX_CHARS = 1000;

export const aiTaskReplyCreateSchema = z
	.object({
		text: z.string().trim().min(1).max(AI_TASK_REPLY_MAX_CHARS)
	})
	.meta({ id: 'AiTaskReplyCreate' });

export const aiTaskListQuerySchema = paginationSchema
	.extend({
		status: z.enum(aiTaskStatusValues).optional(),
		acknowledged: z.stringbool().optional()
	})
	.meta({ id: 'AiTaskListQuery' });

export const aiTaskProposalAcceptSchema = z
	.object({
		itemIds: z.array(z.string().uuid()).min(1).max(30).optional()
	})
	.meta({ id: 'AiTaskProposalAccept' });
