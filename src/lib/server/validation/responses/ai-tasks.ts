import 'zod-openapi';
import { z } from 'zod';
import {
	aiTaskStatusValues,
	aiTaskProcessedByValues,
	aiTaskProcessedByKindValues,
	claudeTaskMessageOutcomeValues,
	claudeTaskMessageRoleValues
} from '$lib/server/schema';
import {
	correctionPublicStateValues,
	replyBlockedReasonValues
} from '$lib/server/claude/tasks/reply-codes';

const aiTaskStatusSchema = z.enum(aiTaskStatusValues);
const aiTaskProcessedBySchema = z.enum(aiTaskProcessedByValues);

const aiTaskProposalNewFoodSchema = z
	.object({
		name: z.string(),
		brand: z.string().nullable(),
		servingSize: z.number(),
		servingUnit: z.string()
	})
	.meta({ id: 'AiTaskProposalNewFood' });

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
		fiber: z.number(),
		newFood: aiTaskProposalNewFoodSchema.nullable()
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

const aiTaskThreadMessageSchema = z
	.object({
		id: z.string().uuid(),
		role: z.string().meta({
			description:
				"Who wrote it: 'user' (a reply the user sent) or 'assistant' (Claude's answer, or a notice that a correction did not work). Unknown values should be shown like 'assistant'.",
			'x-extensible-enum': [...claudeTaskMessageRoleValues]
		}),
		text: z.string(),
		outcome: z
			.string()
			.nullable()
			.meta({
				description:
					"Claude's messages only, null on the user's: 'changed' (the diary entries or foods of this task changed; refresh the task's date), 'answered' (Claude replied without changing anything) or 'failed' (the correction did not work and nothing was changed). Unknown values should be treated like 'answered'.",
				'x-extensible-enum': [...claudeTaskMessageOutcomeValues]
			}),
		createdAt: z.string(),
		unread: z.boolean().meta({
			description:
				'True for an answer of Claude the user has not acknowledged yet (see replyIds on POST /api/ai-tasks/acknowledge). Always false for the user’s own messages.'
		})
	})
	.meta({ id: 'AiTaskThreadMessage' });

const aiTaskClaudeThreadSchema = z
	.object({
		messages: z.array(aiTaskThreadMessageSchema).meta({
			description:
				'The conversation under the task’s resultSummary, oldest first. Empty until the user replies.'
		}),
		correctionState: z.string().meta({
			description:
				"Where the correction for the latest reply stands: 'idle' (nothing running), 'queued', 'running', 'retrying' (waiting to try again after an error) or 'failed' (the last correction did not work; the thread says so and a new reply is possible). Unknown values should be treated as in progress.",
			'x-extensible-enum': [...correctionPublicStateValues]
		}),
		canReply: z.boolean(),
		replyBlockedReason: z
			.string()
			.nullable()
			.meta({
				description:
					"Why canReply is false, null when it is true: not_completed, correction_in_flight, reply_limit_reached, processor_unavailable, budget_exhausted, rate_limited. Matches the code POST /api/ai-tasks/{id}/replies would answer with. Unknown values should be shown as a generic 'replies are not possible right now'.",
				'x-extensible-enum': [...replyBlockedReasonValues]
			}),
		repliesRemaining: z.number().int().meta({
			description:
				'How many more replies this task takes before the per-task limit. A reply whose correction failed does not count; one in progress does.'
		}),
		unreadReplies: z.number().int().meta({
			description: 'Number of messages with unread true.'
		})
	})
	.meta({ id: 'AiTaskClaudeThread' });

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
		claudeThread: aiTaskClaudeThreadSchema.nullable().optional().meta({
			description:
				"Replies to Claude about a task it processed on the server (processedByKind claude), so it fixes what it logged: the task's diary entries, and foods it created for the task that nothing else uses. Present on every completed Claude task, and on other Claude tasks that already have a conversation; null or absent otherwise, including on the response to creating a task."
		}),
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
		acknowledged: z.number().int(),
		repliesAcknowledged: z.number().int().optional().meta({
			description:
				"How many of the named replyIds were marked as read (answers already read or not the user's are skipped). Only present when the request sent replyIds."
		})
	})
	.meta({ id: 'AiTaskAcknowledgeResponse' });

export const aiTaskReplyErrorCodeValues = [
	'task_not_found',
	'not_processed_by_server',
	...replyBlockedReasonValues.filter((code) => code !== 'not_processed_by_server')
] as const;

export const aiTaskReplyErrorResponseSchema = z
	.object({
		error: z.string(),
		code: z
			.string()
			.meta({
				description:
					'Machine-readable reason. Absent on generic failures such as an invalid id. Unknown values should be treated as a generic failure of the given status.',
				'x-extensible-enum': [...aiTaskReplyErrorCodeValues]
			})
			.optional()
	})
	.meta({ id: 'AiTaskReplyErrorResponse' });
