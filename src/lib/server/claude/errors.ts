import type { ClaudeFailureCode } from '../schema';

export type ClaudeGateCode = Extract<
	ClaudeFailureCode,
	'not_configured' | 'disabled' | 'no_access' | 'user_budget_exhausted' | 'global_budget_exhausted'
>;

export class ClaudeGateError extends Error {
	readonly code: ClaudeGateCode;
	constructor(code: ClaudeGateCode) {
		super(`Claude is not available: ${code}`);
		this.name = 'ClaudeGateError';
		this.code = code;
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

export class ClaudeApiError extends Error {
	readonly kind: ClaudeApiErrorKind;
	readonly status?: number;
	readonly requestId?: string;
	readonly retryable: boolean;
	constructor(init: {
		kind: ClaudeApiErrorKind;
		status?: number;
		requestId?: string;
		retryable: boolean;
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
