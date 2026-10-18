import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { reserveCall, settleCall, type Settlement } from './budget';
import { claudeApiKey, claudeConfig, isClaudeConfigured } from './config';
import {
	IMAGE_TOKEN_BOUND,
	REQUEST_TIMEOUT_MS,
	TASK_MAX_TOKENS,
	TOOL_USE_OVERHEAD_TOKENS
} from './constants';
import {
	ClaudeAbortedError,
	ClaudeApiError,
	ClaudeGateError,
	ClaudeProcessorChangedError,
	type ClaudeApiErrorKind
} from './errors';
import { maxCallCostUsd, priceUsage } from './pricing';

export type ClaudeCallParams = {
	system: Anthropic.TextBlockParam[];
	tools: Anthropic.Tool[];
	messages: Anthropic.MessageParam[];
};

export type ClaudeCallOptions = {
	userId: string;
	feature: string;
	aiTaskId?: string;
	params: ClaudeCallParams;
	imageCount: number;
	signal?: AbortSignal;
};

export type ClaudeClient = {
	messages: {
		create(
			params: Anthropic.MessageCreateParamsNonStreaming,
			options?: { signal?: AbortSignal }
		): Promise<Anthropic.Message>;
	};
};

let client: ClaudeClient | null = null;
let testClient: ClaudeClient | null = null;

export function setClaudeClientForTests(fake: ClaudeClient | null): void {
	testClient = fake;
}

function getClient(): ClaudeClient {
	if (testClient) return testClient;
	if (!client) {
		const apiKey = claudeApiKey();
		if (!apiKey) throw new ClaudeGateError('not_configured');
		const real = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
		client = { messages: { create: (params, options) => real.messages.create(params, options) } };
	}
	return client;
}

export function estimateInputTokens(params: ClaudeCallParams, imageCount: number): number {
	const text = JSON.stringify(params, function (this: { type?: string }, key, value) {
		return key === 'data' && this?.type === 'base64' ? '' : value;
	});
	return (
		Math.ceil(Buffer.byteLength(text, 'utf8') / 2) +
		TOOL_USE_OVERHEAD_TOKENS +
		IMAGE_TOKEN_BOUND * imageCount
	);
}

export function mapSdkError(error: unknown): ClaudeApiError | ClaudeAbortedError | null {
	if (error instanceof ClaudeAbortedError || error instanceof ClaudeApiError) return error;
	if (error instanceof Anthropic.APIUserAbortError) return new ClaudeAbortedError();
	const api = (
		kind: ClaudeApiErrorKind,
		retryable: boolean,
		e?: InstanceType<typeof Anthropic.APIError>
	) =>
		new ClaudeApiError({
			kind,
			status: e?.status,
			requestId: e?.requestID ?? undefined,
			retryable
		});
	if (error instanceof Anthropic.APIConnectionTimeoutError) return api('timeout', true, error);
	if (error instanceof Anthropic.APIConnectionError) return api('connection', true, error);
	if (error instanceof Anthropic.RateLimitError) return api('rate_limited', true, error);
	if (error instanceof Anthropic.InternalServerError) return api('server', true, error);
	if (
		error instanceof Anthropic.AuthenticationError ||
		error instanceof Anthropic.PermissionDeniedError
	) {
		return api('auth', false, error);
	}
	if (
		error instanceof Anthropic.BadRequestError ||
		error instanceof Anthropic.NotFoundError ||
		error instanceof Anthropic.UnprocessableEntityError
	) {
		return api('invalid_request', false, error);
	}
	if (error instanceof Anthropic.APIError) return api('other', false, error);
	if (error instanceof Anthropic.AnthropicError) return api('other', false);
	return null;
}

export function settlementFor(outcome: {
	response?: Anthropic.Message;
	error?: unknown;
	sent: boolean;
	reservedUsd: number;
}): Settlement {
	const { response, error, sent, reservedUsd } = outcome;
	if (response) {
		return {
			status: 'succeeded',
			model: response.model,
			costUsd: priceUsage(response.model, response.usage),
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
			cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
			cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
			requestId: (response as { _request_id?: string | null })._request_id ?? null
		};
	}
	if (!sent) return { status: 'failed', costUsd: 0, errorCode: 'not_sent' };
	const answered =
		error instanceof Anthropic.APIError &&
		error.status !== undefined &&
		!(error instanceof Anthropic.APIConnectionError) &&
		!(error instanceof Anthropic.APIUserAbortError);
	if (answered) {
		return {
			status: 'failed',
			costUsd: 0,
			errorCode: kindOf(error),
			requestId: error.requestID ?? null
		};
	}
	return { status: 'failed', costUsd: reservedUsd, errorCode: 'billing_unknown' };
}

const kindOf = (error: unknown): string => {
	const mapped = mapSdkError(error);
	return mapped instanceof ClaudeApiError ? mapped.kind : 'other';
};

export async function callClaude(options: ClaudeCallOptions): Promise<Anthropic.Message> {
	if (!isClaudeConfigured()) throw new ClaudeGateError('not_configured');
	const { model, effort } = claudeConfig();
	const { params, signal } = options;
	const request: Anthropic.MessageCreateParamsNonStreaming = {
		model,
		max_tokens: TASK_MAX_TOKENS,
		output_config: { effort },
		system: params.system,
		tools: params.tools,
		messages: params.messages
	};
	const reservedUsd = maxCallCostUsd(
		model,
		estimateInputTokens(params, options.imageCount),
		TASK_MAX_TOKENS
	);

	let usageId: string;
	try {
		usageId = await reserveCall({
			userId: options.userId,
			feature: options.feature,
			model,
			aiTaskId: options.aiTaskId,
			reservedUsd,
			requireClaudeProcessor: options.feature === 'ai_task'
		});
	} catch (error) {
		if (error instanceof ClaudeGateError || error instanceof ClaudeProcessorChangedError) {
			Sentry.addBreadcrumb({
				category: 'claude',
				level: 'info',
				message: 'Claude call blocked',
				data: { reason: error instanceof ClaudeGateError ? error.code : 'processor_changed' }
			});
		}
		throw error;
	}

	let sent = false;
	let response: Anthropic.Message | undefined;
	let failure: unknown;
	try {
		if (signal?.aborted) throw new ClaudeAbortedError();
		const claude = getClient();
		sent = true;
		response = await claude.messages.create(request, { signal });
		Sentry.logger.info('Claude call finished', {
			taskId: options.aiTaskId ?? '',
			model: response.model,
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
			cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
			cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
			costUsd: priceUsage(response.model, response.usage),
			stopReason: response.stop_reason ?? ''
		});
		return response;
	} catch (error) {
		failure = error;
		const mapped = mapSdkError(error);
		if (!mapped) throw error;
		if (mapped instanceof ClaudeApiError) {
			if (mapped.retryable) {
				Sentry.logger.info('Claude call failed', {
					taskId: options.aiTaskId ?? '',
					kind: mapped.kind,
					status: mapped.status ?? 0
				});
			} else {
				Sentry.captureException(
					new ClaudeApiError({
						kind: mapped.kind,
						status: mapped.status,
						requestId: mapped.requestId,
						retryable: false
					})
				);
			}
		}
		throw mapped;
	} finally {
		try {
			await settleCall(usageId, settlementFor({ response, error: failure, sent, reservedUsd }));
		} catch (settleError) {
			Sentry.captureException(settleError, { tags: { job: 'claude-settle' } });
		}
	}
}
