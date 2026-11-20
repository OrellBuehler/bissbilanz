import 'zod-openapi';
import { z } from 'zod';
import {
	chatActionStatusValues,
	chatMessageRoleValues,
	chatMessageStatusValues,
	chatRunStatusValues
} from '$lib/server/schema';
import { chatChangeDomainValues } from '$lib/server/claude/chat/changes';
import {
	chatErrorCodeValues,
	chatEventTypeValues,
	chatRunReasonValues,
	chatToolStatusValues
} from '$lib/server/claude/chat/codes';

const UNKNOWN_HINT = 'Clients must accept values not listed here.';

const domain = z.string().meta({
	description: `A data domain the assistant changed: refresh what you cache of it. ${UNKNOWN_HINT}`,
	'x-extensible-enum': [...chatChangeDomainValues]
});

const chatChangeSchema = z
	.object({
		domain,
		dates: z.array(z.string()).optional().meta({
			description:
				'Diary days (YYYY-MM-DD) that changed. Set for entries, dayProperties, sleep and weight when known.'
		}),
		ids: z.array(z.string()).optional().meta({
			description: 'Records that changed, e.g. food or recipe ids, when known.'
		})
	})
	.meta({
		id: 'ChatChange',
		description:
			'What changed in one domain. Neither dates nor ids means anything in the domain may have changed: refresh it fully.'
	});

const chatActionPreviewSchema = z
	.object({
		summary: z.string().meta({
			description:
				'One line in the user’s language, e.g. "Delete “Greek yogurt” from Breakfast on 18 Nov 2026".'
		}),
		details: z.array(z.string()).meta({
			description:
				'Extra lines, possibly empty: every field the call sets, replaced lists item by item, nothing shortened. At most 200 lines; a line can be long (up to about 10,000 characters), so let the card scroll and wrap.'
		})
	})
	.meta({ id: 'ChatActionPreview' });

const toolOrActionStatus = z.string().meta({
	description: `Tool parts: running, ok, error (a finished message never has a running part). Action parts: pending, approved, rejected, expired, cancelled. ${UNKNOWN_HINT}`,
	'x-extensible-enum': [...new Set([...chatToolStatusValues, ...chatActionStatusValues])]
});

export const chatMessagePartSchema = z
	.object({
		type: z.string().meta({
			description: `text, image, tool or action. Skip parts of an unknown type. ${UNKNOWN_HINT}`,
			'x-extensible-enum': ['text', 'image', 'tool', 'action']
		}),
		text: z.string().optional().meta({ description: 'text parts: Markdown.' }),
		url: z.string().optional().meta({ description: 'image parts: /uploads/<uuid>.webp.' }),
		toolUseId: z.string().optional().meta({ description: 'tool and action parts.' }),
		name: z.string().optional().meta({ description: 'tool and action parts: the tool name.' }),
		label: z.string().optional().meta({
			description:
				'tool and action parts: a short label in the user’s language, e.g. "Logging food".'
		}),
		status: toolOrActionStatus.optional(),
		summary: z.string().nullable().optional().meta({
			description: 'tool parts: the error message when status is error, otherwise null.'
		}),
		changed: z
			.array(domain)
			.optional()
			.meta({ description: 'tool parts: domains the call changed.' }),
		changes: z.array(chatChangeSchema).optional().meta({ description: 'tool parts.' }),
		actionId: z.string().uuid().optional().meta({ description: 'action parts.' }),
		preview: chatActionPreviewSchema.optional().meta({ description: 'action parts.' }),
		expiresAt: z.string().optional().meta({
			description:
				'action parts: when the action expires (ISO 8601). Omitted when the action has none, never an empty string.'
		})
	})
	.meta({
		id: 'ChatMessagePart',
		description:
			'One block of a message, in display order. Which fields are set depends on type; see docs/ai-chat.md.'
	});

export const chatMessageSchema = z
	.object({
		id: z.string().uuid(),
		conversationId: z.string().uuid(),
		role: z.string().meta({
			description: UNKNOWN_HINT,
			'x-extensible-enum': [...chatMessageRoleValues]
		}),
		status: z.string().meta({
			description: `User messages are always completed. An assistant message is in_progress while its run works or waits for a confirmation, then takes the run's final status. ${UNKNOWN_HINT}`,
			'x-extensible-enum': [...chatMessageStatusValues]
		}),
		reason: z
			.string()
			.nullable()
			.meta({
				description: `The run's reason code (see ChatRun.reason), null on user messages. ${UNKNOWN_HINT}`,
				'x-extensible-enum': [...chatRunReasonValues]
			}),
		runId: z.string().uuid().nullable(),
		parts: z.array(chatMessagePartSchema),
		createdAt: z.string(),
		updatedAt: z.string()
	})
	.meta({ id: 'ChatMessage' });

export const chatRunSchema = z
	.object({
		id: z.string().uuid(),
		conversationId: z.string().uuid(),
		userMessageId: z.string().uuid(),
		assistantMessageId: z.string().uuid().nullable(),
		status: z.string().meta({
			description: `queued, running and awaiting_confirmation are active; completed, failed, cancelled and interrupted are final. ${UNKNOWN_HINT}`,
			'x-extensible-enum': [...chatRunStatusValues]
		}),
		reason: z
			.string()
			.nullable()
			.meta({
				description: `Why the run ended, null while active and for a normal completion. completed: output_limit, iteration_limit. failed: not_configured, disabled, no_access, user_budget_exhausted, global_budget_exhausted, refusal, conversation_too_long, api_error, internal_error. cancelled: user_cancelled, superseded, action_expired. interrupted: server_restart. ${UNKNOWN_HINT}`,
				'x-extensible-enum': [...chatRunReasonValues]
			}),
		changed: z.array(domain).meta({ description: 'Every domain the run changed, so far.' }),
		changes: z.array(chatChangeSchema),
		createdAt: z.string(),
		startedAt: z.string().nullable(),
		finishedAt: z.string().nullable()
	})
	.meta({ id: 'ChatRun' });

export const chatActionSchema = z
	.object({
		id: z.string().uuid(),
		conversationId: z.string().uuid(),
		runId: z.string().uuid(),
		messageId: z.string().uuid().nullable(),
		toolUseId: z.string(),
		name: z.string(),
		label: z.string(),
		status: z.string().meta({
			description: UNKNOWN_HINT,
			'x-extensible-enum': [...chatActionStatusValues]
		}),
		preview: chatActionPreviewSchema,
		expiresAt: z.string().nullable(),
		decidedAt: z.string().nullable(),
		createdAt: z.string()
	})
	.meta({ id: 'ChatAction' });

export const chatCapabilitySchema = z
	.object({
		available: z.boolean(),
		blockedReason: z
			.string()
			.optional()
			.meta({
				description: `Why chat is unavailable: not_configured, disabled, no_access, user_budget_exhausted, global_budget_exhausted. Absent when available. ${UNKNOWN_HINT}`,
				'x-extensible-enum': [
					'not_configured',
					'disabled',
					'no_access',
					'user_budget_exhausted',
					'global_budget_exhausted'
				]
			}),
		remainingBudgetUsd: z.number().optional().meta({
			description: 'USD left this month (2 decimals), only when available.'
		})
	})
	.meta({
		id: 'ChatCapability',
		description:
			'Whether the user can send a chat message now. It needs more budget headroom than an AI task call.'
	});

const chatConversationShape = {
	id: z.string().uuid(),
	title: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	lastMessageAt: z.string(),
	lastSeq: z.number().int().meta({
		description: 'The newest event seq of the conversation; 0 before the first event.'
	})
};

export const chatConversationSchema = z
	.object(chatConversationShape)
	.meta({ id: 'ChatConversation' });

export const chatConversationListItemSchema = z
	.object({ ...chatConversationShape, activeRun: chatRunSchema.nullable() })
	.meta({ id: 'ChatConversationListItem' });

export const chatConversationsResponseSchema = z
	.object({ conversations: z.array(chatConversationListItemSchema), total: z.number().int() })
	.meta({ id: 'ChatConversationsResponse' });

export const chatConversationResponseSchema = z
	.object({ conversation: chatConversationSchema })
	.meta({ id: 'ChatConversationResponse' });

export const chatConversationDetailResponseSchema = z
	.object({
		conversation: chatConversationSchema,
		messages: z.array(chatMessageSchema).meta({
			description:
				'Oldest first. The assistant message of an active run already contains every event up to lastSeq.'
		}),
		pendingActions: z.array(chatActionSchema),
		activeRun: chatRunSchema.nullable(),
		lastSeq: z.number().int().meta({
			description: 'Continue with GET …/events?after=lastSeq.'
		}),
		capability: chatCapabilitySchema
	})
	.meta({ id: 'ChatConversationDetailResponse' });

export const chatMessageAcceptedResponseSchema = z
	.object({
		message: chatMessageSchema,
		run: chatRunSchema,
		seq: z.number().int().meta({
			description: 'Seq of this message’s message_created event.'
		})
	})
	.meta({ id: 'ChatMessageAcceptedResponse' });

export const chatEventSchema = z
	.object({
		seq: z.number().int().meta({
			description:
				'Increases with every event within a conversation. Readers can see gaps (text_delta events are deleted after 24 hours): apply events in order without requiring contiguous seqs.'
		}),
		type: z.string().meta({
			description: `Ignore events of an unknown type (but still advance past their seq). ${UNKNOWN_HINT}`,
			'x-extensible-enum': [...chatEventTypeValues]
		}),
		createdAt: z.string(),
		runId: z.string().uuid().optional(),
		messageId: z.string().uuid().nullable().optional(),
		partIndex: z.number().int().optional().meta({
			description: 'Index of the assistant message part the event writes.'
		}),
		text: z.string().optional().meta({ description: 'text_delta: text to append.' }),
		toolUseId: z.string().optional(),
		name: z.string().optional(),
		label: z.string().optional(),
		status: z
			.string()
			.optional()
			.meta({
				description: `tool_finished: ok, error. action_resolved: approved, rejected, expired, cancelled. run_finished: the run status. ${UNKNOWN_HINT}`
			}),
		summary: z.string().nullable().optional(),
		changed: z.array(domain).optional(),
		changes: z.array(chatChangeSchema).optional(),
		reason: z.string().nullable().optional().meta({ description: 'run_finished: ChatRun.reason.' }),
		actionId: z.string().uuid().optional(),
		action: chatActionSchema.optional(),
		message: chatMessageSchema.optional().meta({
			description: 'message_created and message_completed: the full message.'
		}),
		run: chatRunSchema.optional(),
		capability: chatCapabilitySchema.optional().meta({
			description: 'run_finished: chat availability after the run.'
		}),
		code: z.string().optional().meta({ description: 'error: the reason code.' }),
		error: z.string().optional().meta({ description: 'error: an English message for logs.' })
	})
	.meta({
		id: 'ChatEvent',
		description:
			'One event of a conversation. Fields depend on type; see docs/ai-chat.md for every type with an example.'
	});

export const chatEventsResponseSchema = z
	.object({
		events: z.array(chatEventSchema),
		nextAfter: z.number().int().meta({
			description:
				'Seq of the last returned event (or the after you sent): pass it as after next time.'
		}),
		lastSeq: z.number().int().meta({ description: 'The newest seq at the time of the request.' }),
		hasMore: z
			.boolean()
			.meta({ description: 'More events after nextAfter exist; fetch again at once.' }),
		activeRun: chatRunSchema.nullable()
	})
	.meta({ id: 'ChatEventsResponse' });

export const chatActionDecisionResponseSchema = z
	.object({ action: chatActionSchema, run: chatRunSchema })
	.meta({ id: 'ChatActionDecisionResponse' });

export const chatRunResponseSchema = z
	.object({ run: chatRunSchema })
	.meta({ id: 'ChatRunResponse' });

export const chatErrorResponseSchema = z
	.object({
		error: z.string(),
		code: z
			.string()
			.optional()
			.meta({
				description: `Machine-readable reason; absent on generic failures (invalid id, validation, scope). ${UNKNOWN_HINT}`,
				'x-extensible-enum': [...chatErrorCodeValues]
			}),
		capability: chatCapabilitySchema.optional().meta({
			description: 'chat_unavailable and budget_exhausted: the current capability.'
		}),
		action: chatActionSchema.optional().meta({
			description: 'action_not_pending and action_expired: the action as it is now.'
		}),
		run: chatRunSchema.optional().meta({ description: 'run_not_active: the run as it is now.' })
	})
	.meta({ id: 'ChatErrorResponse' });
