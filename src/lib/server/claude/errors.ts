import type { ClaudeFailureCode } from '../schema';

export type ClaudeGateCode = Extract<
	ClaudeFailureCode,
	'not_configured' | 'disabled' | 'no_access' | 'user_budget_exhausted' | 'global_budget_exhausted'
>;

export class ClaudeGateError extends Error {
	readonly code: ClaudeGateCode;
	readonly requiredUsd: number | null;
	constructor(code: ClaudeGateCode, requiredUsd: number | null = null) {
		super(`Claude is not available: ${code}`);
		this.name = 'ClaudeGateError';
		this.code = code;
		this.requiredUsd = requiredUsd;
	}
}

export class ClaudeProcessorChangedError extends Error {
	constructor() {
		super('The user no longer routes AI tasks to Claude');
		this.name = 'ClaudeProcessorChangedError';
	}
}

export type ClaudeApiErrorKind =
	'timeout' | 'connection' | 'rate_limited' | 'server' | 'invalid_request' | 'auth' | 'other';

export type ClaudeApiErrorTopic = 'prompt_too_long' | 'web_fetch';

export class ClaudeApiError extends Error {
	readonly kind: ClaudeApiErrorKind;
	readonly status?: number;
	readonly requestId?: string;
	readonly retryable: boolean;
	// What a 400 was about, read from the API's error message. Only the topic is
	// kept: the message itself can echo request content.
	readonly topic?: ClaudeApiErrorTopic;
	// How long the API asked to wait before the next try (retry-after), if it said.
	readonly retryAfterMs?: number;
	constructor(init: {
		kind: ClaudeApiErrorKind;
		status?: number;
		requestId?: string;
		retryable: boolean;
		topic?: ClaudeApiErrorTopic;
		retryAfterMs?: number;
	}) {
		super(
			`Claude API error: ${init.kind}` +
				(init.status === undefined ? '' : ` (${init.status})`) +
				(init.requestId ? ` request_id=${init.requestId}` : '')
		);
		this.name = 'ClaudeApiError';
		this.kind = init.kind;
		this.status = init.status;
		this.requestId = init.requestId;
		this.retryable = init.retryable;
		this.topic = init.topic;
		this.retryAfterMs = init.retryAfterMs;
	}
}

export class ClaudeAbortedError extends Error {
	constructor() {
		super('Claude call aborted');
		this.name = 'ClaudeAbortedError';
	}
}

export class LeaseLostError extends Error {
	constructor() {
		super('Task run lease lost');
		this.name = 'LeaseLostError';
	}
}
