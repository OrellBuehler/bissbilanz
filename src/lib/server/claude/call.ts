import Anthropic from '@anthropic-ai/sdk';
import type { Middleware } from '@anthropic-ai/sdk';
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
	type ClaudeApiErrorKind,
	type ClaudeApiErrorTopic
} from './errors';
import {
	WEB_FETCH_MAX_CONTENT_TOKENS,
	maxCallCostUsd,
	priceUsage,
	webFetchResultTokenBound,
	type ServerToolAllowance
} from './pricing';

export type ClaudeCallParams = {
	system: Anthropic.TextBlockParam[];
	tools: Anthropic.ToolUnion[];
	messages: Anthropic.MessageParam[];
	container?: string;
};

export type ClaudeStreamHandlers = {
	onText?: (delta: string) => void;
	onBlock?: (block: Anthropic.ContentBlock) => void;
	// Any bytes of the response, pings included.
	onActivity?: () => void;
};

// The SDK timeout only covers the wait for the response headers; a stream
// that stalls afterwards is cut by these, like any other unknown outcome.
export const STREAM_IDLE_TIMEOUT_MS = 90_000;
export const STREAM_TOTAL_TIMEOUT_MS = 10 * 60_000;

export type ClaudeStreamOptions = ClaudeStreamHandlers & { idleMs?: number; totalMs?: number };

export type ClaudeCallOptions = {
	userId: string;
	feature: string;
	model: string;
	aiTaskId?: string;
	chatConversationId?: string;
	params: ClaudeCallParams;
	imageCount: number;
	maxTokens?: number;
	signal?: AbortSignal;
	stream?: ClaudeStreamOptions;
	expectedRejection?: (error: ClaudeApiError) => boolean;
};

export type ClaudeClient = {
	messages: {
		create(
			params: Anthropic.MessageCreateParamsNonStreaming,
			options?: { signal?: AbortSignal }
		): Promise<Anthropic.Message>;
		stream?(
			params: Anthropic.MessageCreateParamsNonStreaming,
			options: { signal?: AbortSignal } & ClaudeStreamHandlers
		): Promise<Anthropic.Message>;
	};
};

let client: ClaudeClient | null = null;
let testClient: ClaudeClient | null = null;

export function setClaudeClientForTests(fake: ClaudeClient | null): void {
	testClient = fake;
}

const activityMiddleware =
	(onActivity: () => void): Middleware =>
	async (request, next) => {
		const response = await next(request);
		if (!response.body) return response;
		const watched = response.body.pipeThrough(
			new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, controller) {
					onActivity();
					controller.enqueue(chunk);
				}
			})
		);
		return new Response(watched, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	};

function getClient(): ClaudeClient {
	if (testClient) return testClient;
	if (!client) {
		const apiKey = claudeApiKey();
		if (!apiKey) throw new ClaudeGateError('not_configured');
		const real = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
		client = {
			messages: {
				create: (params, options) => real.messages.create(params, options),
				stream: async (params, { signal, onText, onBlock, onActivity }) => {
					const stream = real.messages.stream(params, {
						signal,
						middleware: onActivity ? [activityMiddleware(onActivity)] : []
					});
					const final = stream.finalMessage();
					if (onText) stream.on('text', (delta) => onText(delta));
					if (onBlock) stream.on('contentBlock', (block) => onBlock(block));
					const message = await final;
					return Object.assign(message, { _request_id: stream.request_id ?? null });
				}
			}
		};
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

export function serverToolAllowanceOf(tools: Anthropic.ToolUnion[]): ServerToolAllowance {
	const allowance: ServerToolAllowance = { webSearches: 0, webFetches: 0, webFetchTokens: 0 };
	for (const tool of tools) {
		if (!('type' in tool) || !tool.type || !('max_uses' in tool)) continue;
		const uses = tool.max_uses ?? 0;
		if (tool.type.startsWith('web_search')) allowance.webSearches += uses;
		if (tool.type.startsWith('web_fetch')) {
			const cap = 'max_content_tokens' in tool ? tool.max_content_tokens : null;
			allowance.webFetches += uses;
			allowance.webFetchTokens +=
				uses * webFetchResultTokenBound(cap ?? WEB_FETCH_MAX_CONTENT_TOKENS);
		}
	}
	return allowance;
}

// The SDK keeps the JSON body as error: { type: 'error', error: { type, message } }.
function errorTopic(
	error: InstanceType<typeof Anthropic.APIError> | undefined
): ClaudeApiErrorTopic | undefined {
	const body = error?.error as { error?: { message?: unknown } } | undefined;
	const message = typeof body?.error?.message === 'string' ? body.error.message : '';
	if (/prompt is too long/i.test(message)) return 'prompt_too_long';
	if (/web_?fetch/i.test(message)) return 'web_fetch';
	return undefined;
}

// retry-after-ms (milliseconds) wins over retry-after (seconds or an HTTP date).
export function retryAfterMs(headers: Headers | undefined, now = Date.now()): number | undefined {
	const ms = Number(headers?.get('retry-after-ms') ?? NaN);
	if (Number.isFinite(ms) && ms >= 0) return ms;
	const value = headers?.get('retry-after');
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
	const date = Date.parse(value);
	return Number.isNaN(date) ? undefined : Math.max(0, date - now);
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
			retryable,
			topic: errorTopic(e),
			retryAfterMs: retryable ? retryAfterMs(e?.headers) : undefined
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

async function streamWithDeadlines(
	stream: NonNullable<ClaudeClient['messages']['stream']>,
	request: Anthropic.MessageCreateParamsNonStreaming,
	signal: AbortSignal | undefined,
	options: ClaudeStreamOptions
): Promise<Anthropic.Message> {
	const {
		idleMs = STREAM_IDLE_TIMEOUT_MS,
		totalMs = STREAM_TOTAL_TIMEOUT_MS,
		...handlers
	} = options;
	const deadline = new AbortController();
	let timedOut = false;
	const expire = () => {
		timedOut = true;
		deadline.abort();
	};
	let idle = setTimeout(expire, idleMs);
	const total = setTimeout(expire, totalMs);
	const alive = () => {
		clearTimeout(idle);
		idle = setTimeout(expire, idleMs);
	};
	try {
		return await stream(request, {
			signal: signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal,
			onText: (delta) => {
				alive();
				handlers.onText?.(delta);
			},
			onBlock: (block) => {
				alive();
				handlers.onBlock?.(block);
			},
			onActivity: () => {
				alive();
				handlers.onActivity?.();
			}
		});
	} catch (error) {
		if (timedOut && !signal?.aborted) {
			throw new ClaudeApiError({ kind: 'timeout', retryable: true });
		}
		throw error;
	} finally {
		clearTimeout(idle);
		clearTimeout(total);
	}
}

export async function callClaude(options: ClaudeCallOptions): Promise<Anthropic.Message> {
	if (!isClaudeConfigured()) throw new ClaudeGateError('not_configured');
	const { effort } = claudeConfig();
	const { model, params, signal } = options;
	const maxTokens = options.maxTokens ?? TASK_MAX_TOKENS;
	const request: Anthropic.MessageCreateParamsNonStreaming = {
		model,
		max_tokens: maxTokens,
		output_config: { effort },
		system: params.system,
		tools: params.tools,
		messages: params.messages,
		...(params.container ? { container: params.container } : {})
	};
	const reservedUsd = maxCallCostUsd(
		model,
		estimateInputTokens(params, options.imageCount),
		maxTokens,
		serverToolAllowanceOf(params.tools)
	);

	let usageId: string;
	try {
		usageId = await reserveCall({
			userId: options.userId,
			feature: options.feature,
			model,
			aiTaskId: options.aiTaskId,
			chatConversationId: options.chatConversationId,
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
		const { messages } = getClient();
		if (options.stream && !messages.stream) throw new Error('The Claude client cannot stream');
		sent = true;
		response =
			options.stream && messages.stream
				? await streamWithDeadlines(messages.stream, request, signal, options.stream)
				: await messages.create(request, { signal });
		Sentry.logger.info('Claude call finished', {
			feature: options.feature,
			taskId: options.aiTaskId ?? '',
			chatConversationId: options.chatConversationId ?? '',
			model: response.model,
			requestedModel: model,
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
			cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
			cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
			webSearchRequests: response.usage.server_tool_use?.web_search_requests ?? 0,
			webFetchRequests: response.usage.server_tool_use?.web_fetch_requests ?? 0,
			costUsd: priceUsage(response.model, response.usage),
			reservedUsd,
			stopReason: response.stop_reason ?? '',
			refusalCategory: response.stop_details?.category ?? ''
		});
		if (response.stop_reason === 'refusal') {
			Sentry.captureMessage('Claude refused a request', {
				level: 'warning',
				tags: {
					model: response.model,
					feature: options.feature,
					category: response.stop_details?.category ?? 'none'
				}
			});
		}
		return response;
	} catch (error) {
		failure = error;
		const mapped = mapSdkError(error);
		if (!mapped) throw error;
		if (mapped instanceof ClaudeApiError) {
			if (mapped.retryable) {
				Sentry.logger.info('Claude call failed', {
					feature: options.feature,
					taskId: options.aiTaskId ?? '',
					requestedModel: model,
					kind: mapped.kind,
					status: mapped.status ?? 0
				});
			} else if (options.expectedRejection?.(mapped)) {
				Sentry.addBreadcrumb({
					category: 'claude',
					level: 'info',
					message: 'Claude call rejected as expected',
					data: { kind: mapped.kind, status: mapped.status ?? 0, model }
				});
			} else {
				Sentry.captureException(
					new ClaudeApiError({
						kind: mapped.kind,
						status: mapped.status,
						requestId: mapped.requestId,
						retryable: false
					}),
					{ tags: { model } }
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
