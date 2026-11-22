import { beforeEach, describe, expect, test, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/sveltekit', () => sentry);

const { reportRefusal, retryAfterMs } = await import('$lib/server/claude/api-signals');
const { mapSdkError } = await import('$lib/server/claude/call');
const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');

beforeEach(() => sentry.captureMessage.mockReset());

describe('retryAfterMs', () => {
	test.each([
		[{ 'retry-after': '12' }, 12_000],
		[{ 'retry-after-ms': '250', 'retry-after': '12' }, 250],
		[{ 'retry-after': new Date(61_000).toUTCString() }, 60_000],
		[{ 'retry-after': 'soon' }, undefined],
		[{}, undefined]
	])('%j is %s', (headers, expected) => {
		expect(retryAfterMs(new Headers(headers as Record<string, string>), 1_000)).toBe(expected);
	});

	test('is carried by retryable errors only', () => {
		const headers = new Headers({ 'retry-after': '7' });
		const apiError = (Class: unknown, status: number) =>
			new (Class as new (...args: unknown[]) => Error)(status, {}, 'x', headers);
		expect(mapSdkError(apiError(AnthropicSdk.RateLimitError, 429))).toMatchObject({
			retryAfterMs: 7_000
		});
		expect(mapSdkError(apiError(AnthropicSdk.BadRequestError, 400))).toMatchObject({
			retryAfterMs: undefined
		});
	});
});

describe('reportRefusal', () => {
	const response = (overrides: Record<string, unknown>) =>
		({ model: 'claude-opus-5-5', stop_reason: 'end_turn', ...overrides }) as Anthropic.Message;

	test('reports the category and nothing of the request', () => {
		reportRefusal(
			response({
				stop_reason: 'refusal',
				stop_details: { type: 'refusal', category: 'bio', explanation: 'secret' }
			}),
			'ai_task'
		);
		expect(sentry.captureMessage).toHaveBeenCalledWith('Claude refused a request', {
			level: 'warning',
			tags: { model: 'claude-opus-5-5', feature: 'ai_task', category: 'bio' }
		});
	});

	test('names a refusal without a category', () => {
		reportRefusal(response({ stop_reason: 'refusal', stop_details: null }), 'chat');
		expect(sentry.captureMessage.mock.calls[0]![1].tags.category).toBe('none');
	});

	test('reports nothing for an answered request', () => {
		reportRefusal(response({}), 'chat');
		expect(sentry.captureMessage).not.toHaveBeenCalled();
	});
});
