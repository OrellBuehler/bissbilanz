import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

const KEY = 'sk-ant-unit-test-secret';
const config = {
	model: 'claude-opus-5-5',
	effort: 'medium',
	configured: true,
	apiKey: KEY as string | undefined
};

const sentry = vi.hoisted(() => ({
	captureException: vi.fn(),
	addBreadcrumb: vi.fn(),
	logger: { info: vi.fn(), warn: vi.fn() }
}));
const budget = vi.hoisted(() => ({ reserveCall: vi.fn(), settleCall: vi.fn() }));

vi.mock('@sentry/sveltekit', () => sentry);
vi.mock('$lib/server/claude/budget', () => budget);
vi.mock('$lib/server/claude/config', () => ({
	claudeConfig: () => config,
	claudeApiKey: () => config.apiKey,
	isClaudeConfigured: () => config.configured
}));

const message = (overrides: Record<string, unknown> = {}) =>
	({
		id: 'msg_1',
		type: 'message',
		role: 'assistant',
		model: 'claude-opus-5-5',
		content: [{ type: 'text', text: 'hi', citations: null }],
		stop_reason: 'end_turn',
		stop_sequence: null,
		usage: { input_tokens: 1000, output_tokens: 200 },
		...overrides
	}) as unknown as Anthropic.Message;

const params = {
	system: [{ type: 'text' as const, text: 'system' }],
	tools: [],
	messages: [{ role: 'user' as const, content: 'lunch' }]
};

const load = async (fresh = false) => {
	if (fresh) vi.resetModules();
	return import('$lib/server/claude/call');
};

beforeEach(() => {
	config.model = 'claude-opus-5-5';
	config.configured = true;
	config.apiKey = KEY;
	budget.reserveCall.mockReset().mockResolvedValue('usage-1');
	budget.settleCall.mockReset().mockResolvedValue(undefined);
	for (const fn of [sentry.captureException, sentry.addBreadcrumb, sentry.logger.info])
		fn.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('estimateInputTokens', () => {
	test('is half the serialized bytes plus the tool overhead and the image bound', async () => {
		const { estimateInputTokens } = await load();
		const text = JSON.stringify(params);
		const base = Math.ceil(Buffer.byteLength(text, 'utf8') / 2) + 700;
		expect(estimateInputTokens(params, 0)).toBe(base);
		expect(estimateInputTokens(params, 3)).toBe(base + 3 * 1600);
	});

	test('does not count image data and counts utf-8 bytes', async () => {
		const { estimateInputTokens } = await load();
		const withImage = {
			...params,
			messages: [
				{
					role: 'user' as const,
					content: [
						{
							type: 'image' as const,
							source: {
								type: 'base64' as const,
								media_type: 'image/webp' as const,
								data: 'A'.repeat(100_000)
							}
						},
						{ type: 'text' as const, text: 'ü' }
					]
				}
			]
		};
		const without = {
			...params,
			messages: [
				{
					role: 'user' as const,
					content: [
						{
							type: 'image' as const,
							source: { type: 'base64' as const, media_type: 'image/webp' as const, data: '' }
						},
						{ type: 'text' as const, text: 'ü' }
					]
				}
			]
		};
		expect(estimateInputTokens(withImage, 1)).toBe(estimateInputTokens(without, 1));
		expect(estimateInputTokens(withImage, 1)).toBeLessThan(5000);
	});
});

describe('mapSdkError', () => {
	test('maps by most specific class first', async () => {
		const { mapSdkError } = await load();
		const { ClaudeAbortedError, ClaudeApiError } = await import('$lib/server/claude/errors');
		const headers = new Headers({ 'request-id': 'req_1' });
		const apiError = (Class: new (...args: never[]) => Error, status: number) =>
			new (Class as unknown as new (...args: unknown[]) => Error)(
				status,
				{ error: { message: 'secret' } },
				'secret',
				headers
			);

		expect(mapSdkError(new Anthropic.APIUserAbortError())).toBeInstanceOf(ClaudeAbortedError);
		expect(mapSdkError(new Anthropic.APIConnectionTimeoutError({ message: 'x' }))).toMatchObject({
			kind: 'timeout',
			retryable: true
		});
		expect(mapSdkError(new Anthropic.APIConnectionError({ message: 'x' }))).toMatchObject({
			kind: 'connection',
			retryable: true
		});
		expect(mapSdkError(apiError(Anthropic.RateLimitError, 429))).toMatchObject({
			kind: 'rate_limited',
			status: 429,
			requestId: 'req_1',
			retryable: true
		});
		expect(mapSdkError(apiError(Anthropic.InternalServerError, 529))).toMatchObject({
			kind: 'server',
			status: 529,
			retryable: true
		});
		expect(mapSdkError(apiError(Anthropic.AuthenticationError, 401))).toMatchObject({
			kind: 'auth',
			retryable: false
		});
		expect(mapSdkError(apiError(Anthropic.PermissionDeniedError, 403))).toMatchObject({
			kind: 'auth',
			retryable: false
		});
		for (const [Class, status] of [
			[Anthropic.BadRequestError, 400],
			[Anthropic.NotFoundError, 404],
			[Anthropic.UnprocessableEntityError, 422]
		] as const) {
			expect(mapSdkError(apiError(Class, status))).toMatchObject({
				kind: 'invalid_request',
				retryable: false
			});
		}
		expect(mapSdkError(apiError(Anthropic.ConflictError, 409))).toMatchObject({
			kind: 'other',
			retryable: false
		});
		expect(mapSdkError(new Anthropic.AnthropicError('Streaming is required'))).toBeInstanceOf(
			ClaudeApiError
		);
		expect(mapSdkError(new TypeError('boom'))).toBeNull();
	});

	test('mapped messages never carry request details', async () => {
		const { mapSdkError } = await load();
		const error = new Anthropic.BadRequestError(
			400,
			{ error: { message: `${KEY} prompt text` } },
			`${KEY} prompt text`,
			new Headers({ 'request-id': 'req_9' })
		);
		const mapped = mapSdkError(error)!;
		expect(mapped.message).toBe('Claude API error: invalid_request (400) request_id=req_9');
		expect(JSON.stringify(mapped)).not.toContain(KEY);
	});
});

describe('settlementFor', () => {
	const rate = (status: number) =>
		new Anthropic.RateLimitError(
			status as 429,
			{ error: {} },
			'x',
			new Headers({ 'request-id': 'r1' })
		);

	test('settles a response at the price of the model that answered', async () => {
		const { settlementFor } = await load();
		const result = settlementFor({
			response: message({
				model: 'claude-haiku-5-5',
				_request_id: 'req_ok',
				usage: {
					input_tokens: 1000,
					output_tokens: 1000,
					cache_read_input_tokens: 5,
					cache_creation_input_tokens: 7
				}
			}),
			sent: true,
			reservedUsd: 0.5
		});
		expect(result).toMatchObject({
			status: 'succeeded',
			model: 'claude-haiku-5-5',
			inputTokens: 1000,
			outputTokens: 1000,
			cacheReadInputTokens: 5,
			cacheCreationInputTokens: 7,
			requestId: 'req_ok'
		});
		expect(result.costUsd).toBe(0.000601);
	});

	test('an answered API error is free', async () => {
		const { settlementFor } = await load();
		expect(settlementFor({ error: rate(429), sent: true, reservedUsd: 0.5 })).toEqual({
			status: 'failed',
			costUsd: 0,
			errorCode: 'rate_limited',
			requestId: 'r1'
		});
	});

	test.each([
		['timeout', () => new Anthropic.APIConnectionTimeoutError({ message: 'x' })],
		['connection', () => new Anthropic.APIConnectionError({ message: 'x' })],
		['abort', () => new Anthropic.APIUserAbortError()],
		['unknown', () => new TypeError('boom')]
	])('an unknown billing outcome (%s) is charged the reservation', async (_name, make) => {
		const { settlementFor } = await load();
		expect(settlementFor({ error: make(), sent: true, reservedUsd: 0.5 })).toEqual({
			status: 'failed',
			costUsd: 0.5,
			errorCode: 'billing_unknown'
		});
	});

	test('a request that was never sent is free', async () => {
		const { settlementFor } = await load();
		expect(settlementFor({ error: new TypeError('x'), sent: false, reservedUsd: 0.5 })).toEqual({
			status: 'failed',
			costUsd: 0,
			errorCode: 'not_sent'
		});
	});
});

describe('callClaude against the SDK boundary', () => {
	const call = (mod: Awaited<ReturnType<typeof load>>, extra: Record<string, unknown> = {}) =>
		mod.callClaude({
			userId: 'u1',
			feature: 'ai_task',
			aiTaskId: 't1',
			params,
			imageCount: 0,
			...extra
		});

	test('sends the Opus 5.5 request through the real client with no retries', async () => {
		const fetchMock = vi.fn(async () => Response.json(message()));
		vi.stubGlobal('fetch', fetchMock);
		const mod = await load(true);
		await call(mod);
		await call(mod);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toContain('/v1/messages');
		expect(new Headers(init.headers).get('x-api-key')).toBe(KEY);
		const body = JSON.parse(String(init.body));
		expect(body).toMatchObject({
			model: 'claude-opus-5-5',
			max_tokens: 16000,
			output_config: { effort: 'medium' },
			system: params.system,
			messages: params.messages
		});
		for (const forbidden of ['thinking', 'temperature', 'top_p', 'tool_choice']) {
			expect(body).not.toHaveProperty(forbidden);
		}
		expect(budget.reserveCall).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'u1',
				feature: 'ai_task',
				aiTaskId: 't1',
				requireClaudeProcessor: true
			})
		);
		expect(budget.settleCall).toHaveBeenCalledWith(
			'usage-1',
			expect.objectContaining({ status: 'succeeded' })
		);
	});

	test('does not retry server errors inside the SDK and settles them as free', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({ type: 'error', error: { type: 'api_error', message: KEY } }, { status: 500 })
		);
		vi.stubGlobal('fetch', fetchMock);
		const mod = await load(true);
		const error = await call(mod).catch((e: unknown) => e);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(error).toMatchObject({
			name: 'ClaudeApiError',
			kind: 'server',
			status: 500,
			retryable: true
		});
		expect(JSON.stringify(error)).not.toContain(KEY);
		expect((error as Error).message).not.toContain(KEY);
		expect(budget.settleCall).toHaveBeenCalledWith(
			'usage-1',
			expect.objectContaining({ status: 'failed', costUsd: 0, errorCode: 'server' })
		);
		expect(sentry.captureException).not.toHaveBeenCalled();
	});

	test('reports non-retryable errors without request details', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json(
					{
						type: 'error',
						error: { type: 'invalid_request_error', message: `${KEY} private prompt` }
					},
					{ status: 400 }
				)
			)
		);
		const mod = await load(true);
		await expect(call(mod)).rejects.toMatchObject({ kind: 'invalid_request', retryable: false });
		expect(sentry.captureException).toHaveBeenCalledTimes(1);
		const reported = sentry.captureException.mock.calls[0]![0] as Error;
		expect(reported.message).toBe('Claude API error: invalid_request (400)');
		expect(JSON.stringify(sentry.captureException.mock.calls)).not.toContain(KEY);
		expect(JSON.stringify(sentry.captureException.mock.calls)).not.toContain('private prompt');
	});

	test('treats a missing client as never sent and charges nothing', async () => {
		config.apiKey = undefined;
		const mod = await load(true);
		await expect(call(mod)).rejects.toMatchObject({ code: 'not_configured' });
		expect(budget.settleCall).toHaveBeenCalledWith(
			'usage-1',
			expect.objectContaining({ costUsd: 0, errorCode: 'not_sent' })
		);
	});

	test('fails with not_configured before reserving when there is no key', async () => {
		config.configured = false;
		const mod = await load(true);
		await expect(call(mod)).rejects.toMatchObject({ code: 'not_configured' });
		expect(budget.reserveCall).not.toHaveBeenCalled();
	});

	test('propagates a gate failure from the reservation and leaves a breadcrumb only', async () => {
		const mod = await load(true);
		const { ClaudeGateError, ClaudeProcessorChangedError } =
			await import('$lib/server/claude/errors');
		budget.reserveCall.mockRejectedValueOnce(new ClaudeGateError('no_access'));
		const fake = { messages: { create: vi.fn() } };
		mod.setClaudeClientForTests(fake);
		await expect(call(mod)).rejects.toMatchObject({ code: 'no_access' });
		budget.reserveCall.mockRejectedValueOnce(new ClaudeProcessorChangedError());
		await expect(call(mod)).rejects.toBeInstanceOf(Error);
		expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(2);
		expect(sentry.captureException).not.toHaveBeenCalled();
		expect(fake.messages.create).not.toHaveBeenCalled();
		expect(budget.settleCall).not.toHaveBeenCalled();
	});

	test('does not require the claude processor for other features', async () => {
		const mod = await load(true);
		mod.setClaudeClientForTests({ messages: { create: async () => message() } });
		await call(mod, { feature: 'other' });
		expect(budget.reserveCall).toHaveBeenCalledWith(
			expect.objectContaining({ requireClaudeProcessor: false })
		);
	});

	test('reports a failed settlement without hiding the response', async () => {
		budget.settleCall.mockRejectedValueOnce(new Error('db down'));
		const mod = await load(true);
		mod.setClaudeClientForTests({ messages: { create: async () => message() } });
		await expect(call(mod)).resolves.toMatchObject({ id: 'msg_1' });
		expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error), expect.anything());
	});

	test('rethrows unexpected client errors unchanged and charges the reservation', async () => {
		const mod = await load(true);
		const boom = new TypeError('boom');
		mod.setClaudeClientForTests({ messages: { create: async () => Promise.reject(boom) } });
		await expect(call(mod)).rejects.toBe(boom);
		expect(budget.settleCall).toHaveBeenCalledWith(
			'usage-1',
			expect.objectContaining({ errorCode: 'billing_unknown' })
		);
	});

	test('does not send when already aborted', async () => {
		const mod = await load(true);
		const create = vi.fn();
		mod.setClaudeClientForTests({ messages: { create } });
		const controller = new AbortController();
		controller.abort();
		await expect(call(mod, { signal: controller.signal })).rejects.toMatchObject({
			name: 'ClaudeAbortedError'
		});
		expect(create).not.toHaveBeenCalled();
		expect(budget.settleCall).toHaveBeenCalledWith(
			'usage-1',
			expect.objectContaining({ costUsd: 0, errorCode: 'not_sent' })
		);
	});
});
