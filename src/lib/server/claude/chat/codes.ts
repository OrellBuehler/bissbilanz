// Values of the chat contract's extensible string fields, kept free of
// imports so validation/responses/chat.ts can use them without pulling in the
// runtime.

export const chatEventTypeValues = [
	'message_created',
	'run_started',
	'run_resumed',
	'text_delta',
	'tool_started',
	'tool_finished',
	'action_required',
	'action_resolved',
	'message_completed',
	'run_finished',
	'error'
] as const;
export type ChatEventType = (typeof chatEventTypeValues)[number];

export const chatToolStatusValues = ['running', 'ok', 'error'] as const;
export type ChatToolStatus = (typeof chatToolStatusValues)[number];

export const chatRunReasonValues = [
	'output_limit',
	'iteration_limit',
	'not_configured',
	'disabled',
	'no_access',
	'user_budget_exhausted',
	'global_budget_exhausted',
	'refusal',
	'conversation_too_long',
	'api_error',
	'internal_error',
	'user_cancelled',
	'superseded',
	'action_expired',
	'server_restart'
] as const;
export type ChatRunReason = (typeof chatRunReasonValues)[number];

export const chatErrorCodeValues = [
	'conversation_not_found',
	'conversation_exists',
	'message_id_conflict',
	'run_active',
	'conversation_too_long',
	'daily_limit_reached',
	'chat_unavailable',
	'budget_exhausted',
	'invalid_image',
	'run_not_found',
	'run_not_active',
	'action_not_found',
	'action_not_pending',
	'action_expired'
] as const;
export type ChatErrorCode = (typeof chatErrorCodeValues)[number];
