import 'zod-openapi';
import { z } from 'zod';
import {
	aiTaskStatusValues,
	aiTaskProcessedByValues,
	aiTaskProcessedByKindValues
} from '$lib/server/schema';

const aiTaskStatusSchema = z.enum(aiTaskStatusValues);
const aiTaskProcessedBySchema = z.enum(aiTaskProcessedByValues);

const aiTaskProposalItemSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string(),
		quantityDescription: z.string().nullable(),
		foodId: z.string().uuid().nullable(),
		recipeId: z.string().uuid().nullable(),
		servings: z.number(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number()
	})
	.meta({ id: 'AiTaskProposalItem' });

const aiTaskProposalSchema = z
	.object({
		summary: z.string().nullable(),
		items: z.array(aiTaskProposalItemSchema)
	})
	.meta({ id: 'AiTaskProposal' });

const aiTaskClaudeProcessingSchema = z
	.object({
		state: z.string().meta({
			description:
				"Where server-side Claude processing stands for a pending task. Unknown values should be shown like 'queued'.",
			'x-extensible-enum': ['queued', 'running', 'retrying', 'proposed', 'blocked']
		}),
		proposal: aiTaskProposalSchema.nullable()
	})
	.meta({ id: 'AiTaskClaudeProcessing' });

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
		// Never 'claude': a task Claude resolved reads as 'assistant' here so shipped
		// clients keep decoding. Read processedByKind for the real value.
		processedBy: aiTaskProcessedBySchema.nullable(),
		processedByKind: z
			.string()
			.nullable()
			.meta({
				description:
					"Who actually resolved the task, including values newer than the legacy processedBy enum (e.g. 'claude'). Unknown values should be treated like processedBy.",
				'x-extensible-enum': [...aiTaskProcessedByKindValues]
			})
			.optional(),
		claudeProcessing: aiTaskClaudeProcessingSchema.nullable().optional(),
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
