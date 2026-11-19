import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

const config = { model: 'claude-opus-5-5', effort: 'medium', configured: true };

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
	claudeApiKey: () => 'sk-ant-unit-test-secret',
	isClaudeConfigured: () => config.configured
}));

const params = {
	system: [{ type: 'text' as const, text: 'system' }],
	tools: [],
	messages: [{ role: 'user' as const, content: 'hi' }]
};

const sse = (events: Record<string, unknown>[]) =>
	events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');

const streamBody = sse([
	{
		type: 'message_start',
		message: {
			id: 'msg_1',
			type: 'message',
			role: 'assistant',
			model: 'claude-opus-5-5',
			content: [],
			stop_reason: null,
			stop_sequence: null,
			usage: { input_tokens: 1000, output_tokens: 1 }
		}
	},
	{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
	{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } },
	{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } },
	{ type: 'content_block_stop', index: 0 },
	{
		type: 'message_delta',
		delta: { stop_reason: 'end_turn', stop_sequence: null },
		usage: { output_tokens: 20 }
	},
	{ type: 'message_stop' }
]);

const load = async () => {
	vi.resetModules();
	return import('$lib/server/claude/call');
};

beforeEach(() => {
	budget.reserveCall.mockReset().mockResolvedValue('usage-1');
	budget.settleCall.mockReset().mockResolvedValue(undefined);
	sentry.logger.info.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('streaming calls', () => {
	test('stream through the real client, report deltas and blocks, and settle with the request id', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(streamBody, {
					headers: { 'content-type': 'text/event-stream', 'request-id': 'req_42' }
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		const { callClaude } = await load();
		const deltas: string[] = [];
		const blocks: Anthropic.ContentBlock[] = [];
		const response = await callClaude({
			userId: 'u1',
			feature: 'chat',
			model: 'claude-opus-5-5',
			chatConversationId: 'c1',
			params,
			imageCount: 0,
			maxTokens: 8000,
			stream: { onText: (delta) => deltas.push(delta), onBlock: (block) => blocks.push(block) }
		});
		expect(deltas).toEqual(['Hel', 'lo']);
		expect(blocks).toEqual([expect.objectContaining({ type: 'text', text: 'Hello' })]);
		expect(response.stop_reason).toBe('end_turn');
		const body = JSON.parse(
			String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)
		);
		expect(body).toMatchObject({ stream: true, max_tokens: 8000, model: 'claude-opus-5-5' });
		expect(budget.reserveCall).toHaveBeenCalledWith(
			expect.objectContaining({
				feature: 'chat',
				chatConversationId: 'c1',
				requireClaudeProcessor: false
			})
		);
		expect(budget.settleCall).toHaveBeenCalledWith(
			'usage-1',
			expect.objectContaining({
				status: 'succeeded',
				requestId: 'req_42',
				inputTokens: 1000,
				outputTokens: 20
			})
		);
		expect(sentry.logger.info).toHaveBeenCalledWith(
			'Claude call finished',
			expect.objectContaining({ feature: 'chat', chatConversationId: 'c1' })
		);
	});

	test('uses the test client stream and refuses a client that cannot stream', async () => {
		const mod = await load();
		const message = {
			id: 'm',
			content: [],
			stop_reason: 'end_turn',
			model: 'claude-opus-5-5',
			usage: { input_tokens: 1, output_tokens: 1 }
		} as unknown as Anthropic.Message;
		const stream = vi.fn(
			async (_params: unknown, options: { onText?: (delta: string) => void }) => {
				options.onText?.('x');
				return message;
			}
		);
		const create = vi.fn();
		mod.setClaudeClientForTests({ messages: { create, stream } });
		const seen: string[] = [];
		const options = {
			userId: 'u1',
			feature: 'chat',
			model: 'claude-opus-5-5',
			params,
			imageCount: 0,
			stream: { onText: (delta: string) => seen.push(delta) }
		};
		await expect(mod.callClaude(options)).resolves.toBe(message);
		expect(seen).toEqual(['x']);
		expect(create).not.toHaveBeenCalled();
		expect(stream.mock.calls[0]![0]).toMatchObject({ max_tokens: 16000 });

		mod.setClaudeClientForTests({ messages: { create } });
		await expect(mod.callClaude(options)).rejects.toThrow('cannot stream');
		expect(budget.settleCall).toHaveBeenLastCalledWith(
			'usage-1',
			expect.objectContaining({ errorCode: 'not_sent', costUsd: 0 })
		);
		mod.setClaudeClientForTests(null);
	});
});
