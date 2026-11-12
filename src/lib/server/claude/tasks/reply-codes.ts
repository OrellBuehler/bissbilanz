// Extensible response values of claudeThread, shared by the service and the
// response schemas. Clients decode unknown values into a fallback.

export const replyBlockedReasonValues = [
	'not_processed_by_server',
	'not_completed',
	'correction_in_flight',
	'reply_limit_reached',
	'failed_too_often',
	'processor_unavailable',
	'budget_exhausted',
	'rate_limited'
] as const;
export type ReplyBlockedReason = (typeof replyBlockedReasonValues)[number];

export const correctionPublicStateValues = [
	'idle',
	'queued',
	'running',
	'retrying',
	'failed'
] as const;
export type CorrectionPublicState = (typeof correctionPublicStateValues)[number];
