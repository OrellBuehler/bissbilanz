import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { getTableName } from 'drizzle-orm';
import {
	chatConversations,
	chatMessages,
	chatRuns,
	chatToolCalls,
	claudeAccess,
	users,
	type ChatRun,
	type ChatToolCall
} from '$lib/server/schema';
import {
	ACTION_TTL_MS,
	CHAT_MAX_TOKENS,
	HEARTBEAT_INTERVAL_MS,
	MAX_TOOL_CALLS_PER_RESPONSE,
	TEXT_FLUSH_MS
} from '$lib/server/claude/chat/constants';
import { subscribeConversation } from '$lib/server/claude/chat/events';
import { DECLINED_RESULT, executeChatRun, type StopReason } from '$lib/server/claude/chat/runner';
import { ClaudeAbortedError, ClaudeApiError, ClaudeGateError } from '$lib/server/claude/errors';
import { CLAUDE_MODELS } from '$lib/server/claude/models';

const h = vi.hoisted(() => ({
	callClaude: vi.fn(),
	assertClaudeGates: vi.fn(),
	finalizeRun: vi.fn(),
	emitEvents: vi.fn(),
	appendEvents: vi.fn(),
	getConversation: vi.fn(),
	entryDate: vi.fn(),
	userToday: vi.fn(),
	loadRaw: vi.fn(),
	appendRaw: vi.fn(),
	ensurePromptSnapshot: vi.fn(),
	hydrate: vi.fn(),
	connectMcp: vi.fn(),
	buildActionPreview: vi.fn(),
	captureException: vi.fn(),
	config: { model: 'claude-opus-5-5', effort: 'medium', maxIterations: 10 }
}));

type Query = {
	op: 'select' | 'insert' | 'update';
	table: string;
	fields?: Record<string, unknown>;
	values?: Record<string, any>;
	set?: Record<string, any>;
};

const queries: Query[] = [];
let handle: (query: Query) => unknown = () => [];

function builder(op: Query['op'], table?: unknown, fields?: Record<string, unknown>) {
	const query: Query = { op, table: table ? getTableName(table as never) : '', fields };
	queries.push(query);
	const api: Record<string, unknown> = {
		from: (from: unknown) => {
			query.table = getTableName(from as never);
			return api;
		},
		set: (set: Query['set']) => {
			query.set = set;
			return api;
		},
		values: (values: Query['values']) => {
			query.values = values;
			return api;
		},
		returning: () => api,
		where: () => api,
		for: () => api,
		onConflictDoNothing: () => api,
		then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
			Promise.resolve()
				.then(() => handle(query))
				.then(resolve, reject)
	};
	return api;
}

const db = {
	select: (fields?: Record<string, unknown>) => builder('select', undefined, fields),
	insert: (table: unknown) => builder('insert', table),
	update: (table: unknown) => builder('update', table),
	transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback(db)
};

vi.mock('@sentry/sveltekit', () => ({
	captureException: h.captureException,
	addBreadcrumb: vi.fn(),
	logger: { info: vi.fn() }
}));
vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/preferences', () => ({ getUserTimeZone: vi.fn() }));
vi.mock('$lib/server/claude/call', () => ({ callClaude: h.callClaude }));
vi.mock('$lib/server/claude/capability', () => ({ assertClaudeGates: h.assertClaudeGates }));
vi.mock('$lib/server/claude/config', () => ({ claudeConfig: () => h.config }));
vi.mock('$lib/server/claude/chat/finalize', () => ({ finalizeRun: h.finalizeRun }));
vi.mock('$lib/server/claude/chat/previews', () => ({ buildActionPreview: h.buildActionPreview }));
vi.mock('$lib/server/claude/chat/events', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/events')>()),
	emitEvents: h.emitEvents,
	appendEvents: h.appendEvents
}));
vi.mock('$lib/server/claude/chat/store', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/store')>()),
	getConversation: h.getConversation,
	entryDate: h.entryDate,
	userToday: h.userToday
}));
vi.mock('$lib/server/claude/tasks/photos', () => ({ loadTaskPhotos: vi.fn() }));
vi.mock('$lib/server/mcp/server', () => ({ createMcpServer: vi.fn() }));
vi.mock('$lib/server/claude/chat/tools', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/tools')>()),
	connectMcp: h.connectMcp
}));
vi.mock('$lib/server/claude/chat/transcript', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/transcript')>()),
	loadRaw: h.loadRaw,
	appendRaw: h.appendRaw,
	ensurePromptSnapshot: h.ensurePromptSnapshot,
	hydrate: h.hydrate
}));

const T = {
	runs: getTableName(chatRuns),
	messages: getTableName(chatMessages),
	conversations: getTableName(chatConversations),
	toolCalls: getTableName(chatToolCalls),
	access: getTableName(claudeAccess),
	users: getTableName(users)
};

const NOW = new Date('2026-11-18T10:00:00Z');
const ASSISTANT_ID = 'msg-asst-1';

const runRow = (overrides: Partial<ChatRun> = {}) =>
	({
		id: 'run-1',
		conversationId: 'conv-1',
		userId: 'user-1',
		userMessageId: 'msg-user-1',
		assistantMessageId: null,
		status: 'running',
		reason: null,
		model: null,
		iterations: 0,
		changes: [],
		leaseOwner: 'inst-1',
		heartbeatAt: NOW,
		createdAt: NOW,
		updatedAt: NOW,
		startedAt: NOW,
		finishedAt: null,
		...overrides
	}) as ChatRun;

const toolCallRow = (overrides: Partial<ChatToolCall> = {}) =>
	({
		id: 'call-1',
		conversationId: 'conv-1',
		userId: 'user-1',
		runId: 'run-1',
		messageId: ASSISTANT_ID,
		toolUseId: 'toolu_1',
		toolName: 'delete_entry',
		kind: 'confirm',
		input: {},
		actionStatus: null,
		preview: null,
		partIndex: null,
		expiresAt: null,
		decidedAt: null,
		execution: null,
		resultText: null,
		isError: false,
		changes: [],
		createdAt: NOW,
		finishedAt: null,
		...overrides
	}) as ChatToolCall;

const conversation = { id: 'conv-1', userId: 'user-1', promptId: null };
const snapshot = {
	id: 'snap-1',
	system: [{ type: 'text', text: 'system prompt' }],
	tools: [{ name: 'search_foods' }, { name: 'log_food' }]
};
const userTurn = { role: 'user', content: [{ type: 'text', text: 'Hi' }] };
const EPHEMERAL = { type: 'ephemeral' };

const fresh = () => ({
	claimed: runRow() as ChatRun | null,
	access: { model: null } as { model: string | null } | null,
	userLocale: 'en' as string | null,
	context: { date: '2026-11-18', timezone: 'Europe/Zurich', locale: 'en' } as unknown,
	resumedMessage: null as { parts: unknown[] } | null,
	updatedRunMissing: false,
	lease: true,
	heartbeatAlive: true,
	heartbeatError: null as Error | null,
	pauseOk: true,
	lookups: [] as (ChatToolCall | null)[],
	insertConflicts: 0,
	claimOk: true,
	callSeq: 0,
	lastCall: null as ChatToolCall | null
});
let state = fresh();

const route = (query: Query): unknown => {
	const key = `${query.op}:${query.table}`;
	const set = query.set ?? {};
	switch (key) {
		case `update:${T.runs}`: {
			if (set.status === 'running') return state.claimed ? [state.claimed] : [];
			if (set.status === 'awaiting_confirmation') return state.pauseOk ? [{ id: 'run-1' }] : [];
			if ('assistantMessageId' in set) {
				return [{ ...state.claimed, assistantMessageId: ASSISTANT_ID, model: set.model }];
			}
			if ('model' in set) {
				return state.updatedRunMissing ? [] : [{ ...state.claimed, model: set.model }];
			}
			if (Object.keys(set).join() === 'heartbeatAt') {
				if (state.heartbeatError) throw state.heartbeatError;
				return state.heartbeatAlive ? [{ id: 'run-1' }] : [];
			}
			return [];
		}
		case `select:${T.conversations}`:
			return [{ id: 'conv-1' }];
		case `select:${T.runs}`:
			return state.lease ? [{ id: 'run-1' }] : [];
		case `select:${T.access}`:
			return state.access ? [state.access] : [];
		case `select:${T.users}`:
			return [{ locale: state.userLocale }];
		case `select:${T.messages}`:
			if (query.fields && 'context' in query.fields) return [{ context: state.context }];
			return state.resumedMessage ? [state.resumedMessage] : [];
		case `insert:${T.messages}`:
			return [{ id: ASSISTANT_ID }];
		case `select:${T.toolCalls}`: {
			const row = state.lookups.shift() ?? null;
			if (row) state.lastCall = row;
			return row ? [row] : [];
		}
		case `insert:${T.toolCalls}`: {
			if (state.insertConflicts > 0) {
				state.insertConflicts--;
				return [];
			}
			state.callSeq++;
			const row = toolCallRow({ ...query.values, id: `call-${state.callSeq}` } as never);
			state.lastCall = row;
			return [row];
		}
		case `update:${T.toolCalls}`:
			if (set.execution === 'started') return state.claimOk ? [{ id: state.lastCall?.id }] : [];
			if (set.actionStatus === 'pending') return [{ ...state.lastCall, ...set }];
			return [];
		default:
			return [];
	}
};

const writes = (op: Query['op'], table: string) =>
	queries.filter((query) => query.op === op && query.table === table);
const updatesOf = (table: string) => writes('update', table).map((query) => query.set!);
const insertsOf = (table: string) => writes('insert', table).map((query) => query.values!);
const finishedCalls = () =>
	updatesOf(T.toolCalls).filter((set) => 'execution' in set && set.execution !== 'started');
const runChanges = () =>
	updatesOf(T.runs)
		.filter((set) => 'changes' in set)
		.map((set) => set.changes);

type CallOptions = {
	userId: string;
	model: string;
	signal: AbortSignal;
	params: { system: unknown; tools: unknown; messages: Array<{ role: string; content: unknown }> };
	stream: { onText: (delta: string) => void; onBlock: (block: Record<string, any>) => void };
};
type Step =
	| Anthropic.Message
	| Error
	| ((options: CallOptions) => Promise<Anthropic.Message> | Anthropic.Message);

const script = (...steps: Step[]) => {
	const queue = [...steps];
	h.callClaude.mockImplementation(async (options: CallOptions) => {
		const step = queue.shift();
		if (!step) throw new Error('no scripted response left');
		if (step instanceof Error) throw step;
		if (typeof step === 'function') return step(options);
		for (const block of step.content as Array<Record<string, any>>) {
			if (block.type === 'text') options.stream.onText(block.text);
			options.stream.onBlock(block);
		}
		return step;
	});
};

type Block = Record<string, unknown>;
const text = (value: string): Block => ({ type: 'text', text: value, citations: null });
const toolUse = (name: string, input: Record<string, unknown>, id: string): Block => ({
	type: 'tool_use',
	id,
	name,
	input
});
const serverSearch = (id: string, name = 'web_search'): Block => ({
	type: 'server_tool_use',
	id,
	name,
	input: { query: 'skyr protein' }
});
const searchResult = (
	id: string,
	content: unknown = [{ type: 'web_search_result', url: 'https://x.test' }]
): Block => ({
	type: 'web_search_tool_result',
	tool_use_id: id,
	content
});
const message = (content: Block[], stopReason: string = 'end_turn') =>
	({
		id: 'msg_1',
		type: 'message',
		role: 'assistant',
		model: 'claude-opus-5-5',
		content,
		stop_reason: stopReason,
		stop_sequence: null,
		usage: { input_tokens: 10, output_tokens: 5 }
	}) as unknown as Anthropic.Message;

const mcp = { callTool: vi.fn(), listTools: vi.fn(), close: vi.fn() };
const toolOk = (structured: Record<string, unknown>) => ({
	content: [{ type: 'text', text: JSON.stringify(structured) }],
	structuredContent: structured
});

let controller = new AbortController();
let stop: StopReason | undefined;
const stopReason = vi.fn<() => StopReason | undefined>();

const go = (overrides: { heartbeatMs?: number } = {}) =>
	executeChatRun('run-1', {
		signal: controller.signal,
		instanceId: 'inst-1',
		stopReason,
		...overrides
	});

const drain = () => vi.advanceTimersByTimeAsync(0);
const appended = () =>
	h.appendEvents.mock.calls.flatMap(([, , events]) => events as Array<Record<string, any>>);
const persisted = () =>
	h.appendRaw.mock.calls.flatMap(
		([, , , messages]) => messages as Array<{ role: string; content: any[] }>
	);
const toolResultsSent = () =>
	persisted()
		.filter((turn) => turn.role === 'user')
		.flatMap((turn) => turn.content);
const finalized = () => h.finalizeRun.mock.calls.map(([, ending]) => ending);
const secondRequestMessages = () => h.callClaude.mock.calls[1]![0].params.messages;
const textDeltas = () => appended().filter((event) => event.type === 'text_delta');

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	queries.length = 0;
	state = fresh();
	handle = route;
	controller = new AbortController();
	stop = undefined;
	h.config.maxIterations = 10;
	h.config.model = 'claude-opus-5-5';
	for (const fn of [...Object.values(h), mcp.callTool, mcp.listTools, mcp.close, stopReason]) {
		if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset();
	}
	stopReason.mockImplementation(() => stop);
	h.getConversation.mockResolvedValue(conversation);
	h.ensurePromptSnapshot.mockResolvedValue(snapshot);
	h.loadRaw.mockImplementation(async () => [structuredClone(userTurn)]);
	h.appendRaw.mockResolvedValue(undefined);
	h.appendEvents.mockResolvedValue([]);
	h.emitEvents.mockResolvedValue([]);
	h.finalizeRun.mockResolvedValue(null);
	h.assertClaudeGates.mockResolvedValue(undefined);
	h.entryDate.mockResolvedValue('2026-11-18');
	h.userToday.mockResolvedValue('2026-11-18');
	h.hydrate.mockImplementation(
		async (_userId: string, raw: Array<{ role: string; content: unknown }>) => ({
			messages: raw.map(({ role, content }) => ({ role, content })),
			imageCount: 0
		})
	);
	h.connectMcp.mockResolvedValue(mcp);
	mcp.callTool.mockResolvedValue(toolOk({ ok: true }));
	mcp.close.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('starting a run', () => {
	test('does nothing when the run cannot be claimed', async () => {
		state.claimed = null;
		await go();
		expect(updatesOf(T.runs)[0]).toMatchObject({ status: 'running', leaseOwner: 'inst-1' });
		expect(h.getConversation).not.toHaveBeenCalled();
		expect(h.connectMcp).not.toHaveBeenCalled();
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	test('returns quietly when the conversation is gone', async () => {
		h.getConversation.mockResolvedValue(null);
		await go();
		expect(h.getConversation).toHaveBeenCalledWith(db, 'user-1', 'conv-1');
		expect(h.connectMcp).not.toHaveBeenCalled();
		expect(h.callClaude).not.toHaveBeenCalled();
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(mcp.close).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	test('creates the assistant message, announces run_started and answers from the frozen prompt', async () => {
		script(message([text('Hello there')]));
		const listener = vi.fn();
		const other = vi.fn();
		const unsubscribe = [
			subscribeConversation('conv-1', listener),
			subscribeConversation('conv-2', other)
		];
		await go();
		for (const off of unsubscribe) off();

		expect(insertsOf(T.messages)).toEqual([
			{
				conversationId: 'conv-1',
				userId: 'user-1',
				runId: 'run-1',
				role: 'assistant',
				status: 'in_progress',
				parts: []
			}
		]);
		expect(updatesOf(T.runs).find((set) => 'assistantMessageId' in set)).toMatchObject({
			assistantMessageId: ASSISTANT_ID,
			model: 'claude-opus-5-5'
		});
		expect(h.emitEvents).toHaveBeenCalledWith('conv-1', [
			{
				type: 'run_started',
				runId: 'run-1',
				messageId: ASSISTANT_ID,
				run: expect.objectContaining({
					id: 'run-1',
					assistantMessageId: ASSISTANT_ID,
					status: 'running',
					startedAt: NOW.toISOString()
				})
			}
		]);
		expect(h.ensurePromptSnapshot).toHaveBeenCalledWith(conversation, 'claude-opus-5-5');
		expect(h.connectMcp).toHaveBeenCalledWith('user-1');
		expect(h.loadRaw).toHaveBeenCalledWith(db, 'conv-1');
		expect(h.hydrate).toHaveBeenCalledWith('user-1', [userTurn], expect.any(Map));

		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(h.callClaude).toHaveBeenCalledWith({
			userId: 'user-1',
			feature: 'chat',
			model: 'claude-opus-5-5',
			chatConversationId: 'conv-1',
			params: {
				system: [{ type: 'text', text: 'system prompt', cache_control: EPHEMERAL }],
				tools: [{ name: 'search_foods' }, { name: 'log_food', cache_control: EPHEMERAL }],
				messages: [
					{ role: 'user', content: [{ type: 'text', text: 'Hi', cache_control: EPHEMERAL }] }
				]
			},
			imageCount: 0,
			maxTokens: CHAT_MAX_TOKENS,
			signal: expect.any(AbortSignal),
			stream: { onText: expect.any(Function), onBlock: expect.any(Function) }
		});

		expect(appended()).toEqual([
			{
				type: 'text_delta',
				runId: 'run-1',
				messageId: ASSISTANT_ID,
				partIndex: 0,
				text: 'Hello there'
			}
		]);
		expect(h.appendEvents).toHaveBeenCalledWith(db, 'conv-1', expect.any(Array));
		expect(persisted()).toEqual([{ role: 'assistant', content: [text('Hello there')] }]);
		expect(h.appendRaw).toHaveBeenCalledWith(db, 'conv-1', 'run-1', expect.any(Array));
		expect(updatesOf(T.runs).find((set) => 'iterations' in set)).toMatchObject({ iterations: 1 });
		expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
		expect(h.finalizeRun).toHaveBeenCalledWith('run-1', expect.anything());
		expect(mcp.close).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalled();
		expect(other).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	test('continues the iteration count and the message of a resumed run', async () => {
		state.claimed = runRow({ assistantMessageId: 'msg-asst-9', iterations: 2 });
		const earlier = [{ type: 'text', text: 'Earlier' }];
		state.resumedMessage = { parts: earlier };
		script(message([text('Next')]));
		await go();

		expect(insertsOf(T.messages)).toEqual([]);
		expect(updatesOf(T.runs).find((set) => 'model' in set)).toMatchObject({
			model: 'claude-opus-5-5'
		});
		expect(h.emitEvents).toHaveBeenCalledWith('conv-1', [
			{
				type: 'run_resumed',
				runId: 'run-1',
				messageId: 'msg-asst-9',
				run: expect.objectContaining({ id: 'run-1', assistantMessageId: 'msg-asst-9' })
			}
		]);
		expect(textDeltas()).toEqual([
			{ type: 'text_delta', runId: 'run-1', messageId: 'msg-asst-9', partIndex: 1, text: 'Next' }
		]);
		expect(earlier).toEqual([{ type: 'text', text: 'Earlier' }]);
		expect(updatesOf(T.runs).find((set) => 'iterations' in set)).toMatchObject({ iterations: 3 });
	});

	test('resumes with an empty message and the claimed run when the rows are missing', async () => {
		state.claimed = runRow({ assistantMessageId: 'msg-asst-9' });
		state.updatedRunMissing = true;
		script(message([text('Hi')]));
		await go();
		expect(h.emitEvents).toHaveBeenCalledWith('conv-1', [
			expect.objectContaining({
				type: 'run_resumed',
				run: expect.objectContaining({ id: 'run-1', assistantMessageId: 'msg-asst-9' })
			})
		]);
		expect(textDeltas()[0]).toMatchObject({ partIndex: 0, text: 'Hi' });
	});

	test('uses the model the user picked when it is selectable and the default otherwise', async () => {
		const picked = CLAUDE_MODELS.find((model) => model.id !== h.config.model)!.id;
		state.access = { model: picked };
		script(message([text('One')]), message([text('Two')]));
		await go();
		expect(h.ensurePromptSnapshot).toHaveBeenCalledWith(conversation, picked);
		expect(h.callClaude.mock.calls[0]![0].model).toBe(picked);
		expect(updatesOf(T.runs).find((set) => 'assistantMessageId' in set)).toMatchObject({
			model: picked
		});

		state.access = { model: 'gpt-5' };
		await go();
		expect(h.callClaude.mock.calls[1]![0].model).toBe('claude-opus-5-5');
		state.access = null;
		script(message([text('Three')]));
		await go();
		expect(h.callClaude.mock.calls[2]![0].model).toBe('claude-opus-5-5');
	});

	test.each([
		[
			'the locale of the message context',
			{ locale: 'de-CH' },
			'en',
			'Durchsuche deine Lebensmittel'
		],
		['the locale of the user without a context', null, 'de', 'Durchsuche deine Lebensmittel'],
		['English when neither is known', {}, null, 'Searching your foods']
	])('labels tools in %s', async (_name, context, userLocale, label) => {
		state.context = context;
		state.userLocale = userLocale;
		script(
			message([toolUse('search_foods', { query: 'yogurt' }, 'toolu_1')], 'tool_use'),
			message([text('Done')])
		);
		await go();
		expect(appended().find((event) => event.type === 'tool_started')).toMatchObject({ label });
	});
});

describe('the event writer', () => {
	test('batches text deltas per flush interval and writes the rest when the call ends', async () => {
		script(async (options) => {
			options.stream.onText('Hel');
			options.stream.onText('lo ');
			options.stream.onText('wor');
			await vi.advanceTimersByTimeAsync(TEXT_FLUSH_MS - 1);
			expect(textDeltas()).toEqual([]);
			await vi.advanceTimersByTimeAsync(1);
			await drain();
			expect(textDeltas().map((event) => event.text)).toEqual(['Hello wor']);
			options.stream.onText('ld');
			await vi.advanceTimersByTimeAsync(TEXT_FLUSH_MS - 1);
			expect(textDeltas()).toHaveLength(1);
			return message([text('Hello world')]);
		});
		await go();
		expect(textDeltas().map((event) => [event.partIndex, event.text])).toEqual([
			[0, 'Hello wor'],
			[0, 'ld']
		]);
		expect(persisted()[0]!.content).toEqual([text('Hello world')]);
	});

	test('ignores empty deltas', async () => {
		script(async (options) => {
			options.stream.onText('');
			return message([text('')]);
		});
		await go();
		expect(appended()).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('keeps text, tool and text in separate parts, flushing pending text first', async () => {
		script(async (options) => {
			options.stream.onText('Let me check. ');
			options.stream.onBlock(serverSearch('srv_1'));
			options.stream.onBlock(searchResult('srv_1'));
			options.stream.onText('Found it.');
			return message([
				text('Let me check. '),
				serverSearch('srv_1'),
				searchResult('srv_1'),
				text('Found it.')
			]);
		});
		await go();
		expect(appended().map((event) => [event.type, event.partIndex])).toEqual([
			['text_delta', 0],
			['tool_started', 1],
			['tool_finished', 1],
			['text_delta', 2]
		]);
		expect(appended()[0]).toMatchObject({ text: 'Let me check. ' });
		expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
	});

	test('starts a new text part after a finished text block', async () => {
		script(async (options) => {
			options.stream.onText('First');
			options.stream.onBlock(text('First'));
			options.stream.onText('Second');
			return message([text('First'), text('Second')]);
		});
		await go();
		expect(textDeltas().map((event) => [event.partIndex, event.text])).toEqual([
			[0, 'First'],
			[1, 'Second']
		]);
	});

	test('reports a failed write once, skips later events and fails the run', async () => {
		const failure = new Error('db down');
		h.appendEvents.mockRejectedValueOnce(failure);
		script(message([serverSearch('srv_1'), searchResult('srv_1'), text('Found it.')]));
		await go();
		expect(h.appendEvents).toHaveBeenCalledTimes(1);
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(h.captureException).toHaveBeenCalledTimes(2);
		for (const call of h.captureException.mock.calls) {
			expect(call).toEqual([failure, { tags: { job: 'chat-run' } }]);
		}
		expect(finalized()).toEqual([
			{ status: 'failed', reason: 'internal_error', instanceId: 'inst-1' }
		]);
		expect(mcp.close).toHaveBeenCalledTimes(1);
	});

	test('drops a run silently when the lease was lost during a write', async () => {
		state.lease = false;
		script(message([text('Hello')]));
		await go();
		expect(h.appendEvents).not.toHaveBeenCalled();
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(h.captureException).not.toHaveBeenCalled();
		expect(stopReason).not.toHaveBeenCalled();
		expect(mcp.close).toHaveBeenCalledTimes(1);
	});
});

describe('web search and fetch', () => {
	test('shows web search as a tool part and persists the turn', async () => {
		const turn = [serverSearch('srv_1'), searchResult('srv_1'), text('Skyr has 11 g.')];
		script(message(turn));
		await go();
		expect(appended()).toEqual([
			{
				type: 'tool_started',
				runId: 'run-1',
				messageId: ASSISTANT_ID,
				partIndex: 0,
				toolUseId: 'srv_1',
				name: 'web_search',
				label: 'Searching the web'
			},
			{
				type: 'tool_finished',
				runId: 'run-1',
				messageId: ASSISTANT_ID,
				partIndex: 0,
				toolUseId: 'srv_1',
				name: 'web_search',
				status: 'ok',
				summary: null,
				changed: [],
				changes: []
			},
			{
				type: 'text_delta',
				runId: 'run-1',
				messageId: ASSISTANT_ID,
				partIndex: 1,
				text: 'Skyr has 11 g.'
			}
		]);
		expect(persisted()).toEqual([{ role: 'assistant', content: turn }]);
	});

	test.each([
		['a list of results', searchResult('srv_1'), 'ok'],
		['no content', searchResult('srv_1', null), 'ok'],
		[
			'a search error',
			searchResult('srv_1', { type: 'web_search_tool_result_error', error_code: 'unavailable' }),
			'error'
		],
		[
			'a fetched page',
			{
				type: 'web_fetch_tool_result',
				tool_use_id: 'srv_1',
				content: { type: 'web_fetch_result', url: 'https://x.test' }
			},
			'ok'
		],
		[
			'a fetch error',
			{
				type: 'web_fetch_tool_result',
				tool_use_id: 'srv_1',
				content: { type: 'web_fetch_tool_error', error_code: 'url_not_accessible' }
			},
			'error'
		]
	])('finishes the tool part with %s as %s', async (_name, result, status) => {
		const fetch = (result as { type: string }).type === 'web_fetch_tool_result';
		script(message([serverSearch('srv_1', fetch ? 'web_fetch' : 'web_search'), result as Block]));
		await go();
		const finished = appended().find((event) => event.type === 'tool_finished');
		expect(finished).toMatchObject({
			toolUseId: 'srv_1',
			name: fetch ? 'web_fetch' : 'web_search',
			status
		});
	});

	test('labels web fetch and ignores results of calls it never saw start', async () => {
		script(async (options) => {
			options.stream.onBlock(serverSearch('srv_1', 'web_fetch'));
			options.stream.onBlock(searchResult('srv_unknown'));
			options.stream.onBlock({
				type: 'web_fetch_tool_result',
				tool_use_id: 'srv_1',
				content: null
			});
			options.stream.onBlock({ type: 'thinking', thinking: '', signature: 's' });
			return message([text('x')]);
		});
		await go();
		expect(appended().filter((event) => event.type !== 'text_delta')).toMatchObject([
			{ type: 'tool_started', toolUseId: 'srv_1', label: 'Reading a web page' },
			{ type: 'tool_finished', toolUseId: 'srv_1', status: 'ok' }
		]);
	});
});

describe('the loop and its stop reasons', () => {
	test('answers tool calls and asks again until the model is done', async () => {
		script(
			message([text('Looking'), toolUse('list_meal_types', {}, 'toolu_1')], 'tool_use'),
			message([text('You have four meals.')])
		);
		mcp.callTool.mockResolvedValue(toolOk({ mealTypes: ['Breakfast', 'Lunch'] }));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(mcp.callTool).toHaveBeenCalledWith('list_meal_types', {});
		expect(persisted().map((turn) => turn.role)).toEqual(['assistant', 'user', 'assistant']);
		expect(toolResultsSent()).toEqual([
			{
				type: 'tool_result',
				tool_use_id: 'toolu_1',
				content: JSON.stringify({ mealTypes: ['Breakfast', 'Lunch'] })
			}
		]);
		expect(secondRequestMessages().map((turn: { role: string }) => turn.role)).toEqual([
			'user',
			'assistant',
			'user'
		]);
		expect(h.assertClaudeGates).toHaveBeenCalledWith('user-1');
		expect(
			updatesOf(T.runs)
				.filter((set) => 'iterations' in set)
				.map((set) => set.iterations)
		).toEqual([1, 2]);
		expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
	});

	test('completes when the stop reason says tool_use but no call is open', async () => {
		script(message([text('No tools after all')], 'tool_use'));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
	});

	test('does not persist a turn without content', async () => {
		script(message([]));
		await go();
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
	});

	test('continues a paused turn without persisting it and persists both turns at the end', async () => {
		const first = [serverSearch('srv_1')];
		const second = [searchResult('srv_1'), text('Done')];
		script(message(first, 'pause_turn'), message(second));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(h.hydrate.mock.calls[1]![1]).toEqual([userTurn, { role: 'assistant', content: first }]);
		expect(secondRequestMessages().at(-1)).toMatchObject({ role: 'assistant', content: first });
		expect(h.appendRaw).toHaveBeenCalledTimes(1);
		expect(persisted()).toEqual([
			{ role: 'assistant', content: first },
			{ role: 'assistant', content: second }
		]);
		expect(appended().map((event) => [event.type, event.partIndex])).toEqual([
			['tool_started', 0],
			['tool_finished', 0],
			['text_delta', 1]
		]);
		expect(
			updatesOf(T.runs)
				.filter((set) => 'iterations' in set)
				.map((set) => set.iterations)
		).toEqual([1, 2]);
		expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
	});

	test('buffers a turn whose server tool is unanswered even when it says end_turn', async () => {
		const first = [text('Let me search'), serverSearch('srv_1')];
		script(message(first), message([searchResult('srv_1'), text('Found')]));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(secondRequestMessages().at(-1)).toMatchObject({ role: 'assistant', content: first });
		expect(persisted()).toHaveLength(2);
	});

	test('ends with output_limit and keeps a complete cut-off answer', async () => {
		script(message([text('A long answer that was cut')], 'max_tokens'));
		await go();
		expect(persisted()).toEqual([
			{ role: 'assistant', content: [text('A long answer that was cut')] }
		]);
		expect(finalized()).toEqual([
			{ status: 'completed', reason: 'output_limit', instanceId: 'inst-1' }
		]);
	});

	test('persists the buffered turns with a cut-off answer', async () => {
		const first = [serverSearch('srv_1')];
		const second = [searchResult('srv_1'), text('Cut off')];
		script(message(first, 'pause_turn'), message(second, 'max_tokens'));
		await go();
		expect(persisted()).toEqual([
			{ role: 'assistant', content: first },
			{ role: 'assistant', content: second }
		]);
		expect(finalized()).toEqual([
			{ status: 'completed', reason: 'output_limit', instanceId: 'inst-1' }
		]);
	});

	test('keeps a cut-off tool call out of the transcript and never runs it', async () => {
		script(
			message([text('Here is'), toolUse('search_foods', { query: 'x' }, 'toolu_1')], 'max_tokens')
		);
		await go();
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(mcp.callTool).not.toHaveBeenCalled();
		expect(insertsOf(T.toolCalls)).toEqual([]);
		expect(finalized()).toEqual([
			{ status: 'completed', reason: 'output_limit', instanceId: 'inst-1' }
		]);
	});

	test('keeps a cut-off server tool call out of the transcript', async () => {
		script(message([serverSearch('srv_1')], 'max_tokens'));
		await go();
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(finalized()).toEqual([
			{ status: 'completed', reason: 'output_limit', instanceId: 'inst-1' }
		]);
	});

	test('fails on a refusal without persisting the turn', async () => {
		script(message([text('I cannot help')], 'refusal'));
		await go();
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(finalized()).toEqual([{ status: 'failed', reason: 'refusal', instanceId: 'inst-1' }]);
	});

	test('stops at the iteration cap before calling Claude again', async () => {
		state.claimed = runRow({ iterations: 10 });
		await go();
		expect(h.callClaude).not.toHaveBeenCalled();
		expect(h.hydrate).not.toHaveBeenCalled();
		expect(h.assertClaudeGates).not.toHaveBeenCalled();
		expect(finalized()).toEqual([
			{ status: 'completed', reason: 'iteration_limit', instanceId: 'inst-1' }
		]);
	});

	test('answers the tool calls of the last turn, then stops at the iteration cap', async () => {
		h.config.maxIterations = 1;
		script(message([toolUse('list_meal_types', {}, 'toolu_1')], 'tool_use'));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(persisted().map((turn) => turn.role)).toEqual(['assistant', 'user']);
		expect(finalized()).toEqual([
			{ status: 'completed', reason: 'iteration_limit', instanceId: 'inst-1' }
		]);
	});
});

describe('tool calls', () => {
	const respondWith = (...blocks: Block[]) =>
		script(message(blocks, 'tool_use'), message([text('Done')]));
	const resultText = (id = 'toolu_1') =>
		toolResultsSent().find((block) => block.tool_use_id === id);

	describe('already known calls', () => {
		test('reuses an answered row without running anything', async () => {
			state.lookups = [toolCallRow({ resultText: 'cached', actionStatus: 'approved' })];
			respondWith(toolUse('delete_entry', { entryId: 'e1' }, 'toolu_1'));
			await go();
			expect(resultText()).toEqual({
				type: 'tool_result',
				tool_use_id: 'toolu_1',
				content: 'cached'
			});
			expect(mcp.callTool).not.toHaveBeenCalled();
			expect(insertsOf(T.toolCalls)).toEqual([]);
			expect(appended().filter((event) => event.type.startsWith('tool_'))).toEqual([]);
		});

		test('reuses an answered error row as an error', async () => {
			state.lookups = [toolCallRow({ resultText: 'boom', isError: true })];
			respondWith(toolUse('delete_entry', { entryId: 'e1' }, 'toolu_1'));
			await go();
			expect(resultText()).toEqual({
				type: 'tool_result',
				tool_use_id: 'toolu_1',
				content: 'boom',
				is_error: true
			});
		});

		test('declines a rejected action and tells the model', async () => {
			state.lookups = [toolCallRow({ actionStatus: 'rejected' })];
			respondWith(toolUse('delete_entry', { entryId: 'e1' }, 'toolu_1'));
			await go();
			expect(resultText()).toEqual({
				type: 'tool_result',
				tool_use_id: 'toolu_1',
				content: DECLINED_RESULT,
				is_error: true
			});
			expect(updatesOf(T.toolCalls)[0]).toMatchObject({
				resultText: DECLINED_RESULT,
				isError: true,
				changes: []
			});
			expect(mcp.callTool).not.toHaveBeenCalled();
		});

		test.each([[null], ['cancelled'], ['expired']] as const)(
			'reports an unknown outcome for a call left in state %s',
			async (actionStatus) => {
				state.lookups = [toolCallRow({ actionStatus, execution: 'started' })];
				respondWith(toolUse('delete_entry', { entryId: 'e1' }, 'toolu_1'));
				await go();
				const text = 'Outcome unknown: this call was interrupted. Check the data before retrying.';
				expect(resultText()).toEqual({
					type: 'tool_result',
					tool_use_id: 'toolu_1',
					content: text,
					is_error: true
				});
				expect(updatesOf(T.toolCalls)[0]).toMatchObject({ resultText: text, isError: true });
				expect(mcp.callTool).not.toHaveBeenCalled();
			}
		);

		test('pauses the run on a pending action', async () => {
			state.lookups = [toolCallRow({ actionStatus: 'pending' })];
			script(message([toolUse('delete_entry', { entryId: 'e1' }, 'toolu_1')], 'tool_use'));
			await go();
			expect(h.callClaude).toHaveBeenCalledTimes(1);
			expect(persisted().map((turn) => turn.role)).toEqual(['assistant']);
			expect(updatesOf(T.runs).find((set) => set.status === 'awaiting_confirmation')).toMatchObject(
				{
					leaseOwner: null,
					heartbeatAt: null,
					iterations: 1
				}
			);
			expect(updatesOf(T.messages)).toEqual([expect.objectContaining({ parts: [] })]);
			expect(h.finalizeRun).not.toHaveBeenCalled();
			expect(mcp.callTool).not.toHaveBeenCalled();
			expect(mcp.close).toHaveBeenCalledTimes(1);
		});

		test('runs an approved action once on resume and continues from the stored message', async () => {
			state.claimed = runRow({ assistantMessageId: ASSISTANT_ID, iterations: 1 });
			const action = {
				type: 'action',
				actionId: 'call-1',
				toolUseId: 'toolu_1',
				status: 'approved'
			};
			state.resumedMessage = { parts: [action] };
			state.lookups = [
				toolCallRow({
					actionStatus: 'approved',
					toolName: 'delete_entry',
					input: { entryId: 'e1' }
				})
			];
			h.loadRaw.mockResolvedValue([
				userTurn,
				{ role: 'assistant', content: [toolUse('delete_entry', { entryId: 'e1' }, 'toolu_1')] }
			]);
			mcp.callTool.mockResolvedValue(toolOk({ deleted: true }));
			script(message([text('Deleted.')]));
			await go();

			expect(mcp.callTool).toHaveBeenCalledTimes(1);
			expect(mcp.callTool).toHaveBeenCalledWith('delete_entry', { entryId: 'e1' });
			expect(updatesOf(T.toolCalls)[0]).toEqual({ execution: 'started' });
			expect(finishedCalls()).toEqual([
				expect.objectContaining({
					execution: 'succeeded',
					isError: false,
					changes: [{ domain: 'entries', dates: ['2026-11-18'] }]
				})
			]);
			expect(h.entryDate).toHaveBeenCalledWith('user-1', 'e1');
			expect(runChanges()).toEqual([[{ domain: 'entries', dates: ['2026-11-18'] }]]);
			expect(appended().map((event) => [event.type, event.partIndex])).toEqual([
				['tool_started', 1],
				['tool_finished', 1],
				['text_delta', 2]
			]);
			expect(resultText()).toEqual({
				type: 'tool_result',
				tool_use_id: 'toolu_1',
				content: JSON.stringify({ deleted: true })
			});
			expect(h.callClaude).toHaveBeenCalledTimes(1);
			expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
		});

		test('does not run a call twice when its execution was already claimed', async () => {
			state.claimed = runRow({ assistantMessageId: ASSISTANT_ID });
			state.claimOk = false;
			state.lookups = [toolCallRow({ actionStatus: 'approved' })];
			h.loadRaw.mockResolvedValue([
				userTurn,
				{ role: 'assistant', content: [toolUse('delete_entry', { entryId: 'e1' }, 'toolu_1')] }
			]);
			script(message([text('Ok')]));
			await go();
			const text_ =
				'Outcome unknown: this call was already started once. Check the data before retrying.';
			expect(mcp.callTool).not.toHaveBeenCalled();
			expect(appended().filter((event) => event.type.startsWith('tool_'))).toEqual([]);
			expect(resultText()).toEqual({
				type: 'tool_result',
				tool_use_id: 'toolu_1',
				content: text_,
				is_error: true
			});
			expect(updatesOf(T.toolCalls).at(-1)).toMatchObject({ resultText: text_, isError: true });
		});

		test('looks the call up again when another writer inserted it first', async () => {
			state.lookups = [null, toolCallRow({ resultText: 'raced', isError: false })];
			state.insertConflicts = 1;
			respondWith(toolUse('search_foods', { query: 'x' }, 'toolu_1'));
			await go();
			expect(insertsOf(T.toolCalls)).toHaveLength(1);
			expect(resultText()).toEqual({
				type: 'tool_result',
				tool_use_id: 'toolu_1',
				content: 'raced'
			});
			expect(mcp.callTool).not.toHaveBeenCalled();
		});
	});

	describe('new calls', () => {
		test.each([
			['an unknown tool', 'frobnicate'],
			['an excluded tool', 'complete_ai_task']
		])('answers %s with an error and keeps going', async (_name, name) => {
			respondWith(toolUse(name, { x: 1 }, 'toolu_1'));
			await go();
			const text = JSON.stringify({ error: `Unknown tool ${name}.` });
			expect(insertsOf(T.toolCalls)).toEqual([
				{
					conversationId: 'conv-1',
					userId: 'user-1',
					runId: 'run-1',
					messageId: ASSISTANT_ID,
					toolUseId: 'toolu_1',
					toolName: name,
					kind: 'read',
					input: { x: 1 }
				}
			]);
			expect(updatesOf(T.toolCalls)[0]).toMatchObject({
				resultText: text,
				isError: true,
				changes: []
			});
			expect(resultText()).toEqual({
				type: 'tool_result',
				tool_use_id: 'toolu_1',
				content: text,
				is_error: true
			});
			expect(mcp.callTool).not.toHaveBeenCalled();
			expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
		});

		test('refuses the calls past the per-response limit', async () => {
			const blocks = Array.from({ length: MAX_TOOL_CALLS_PER_RESPONSE + 1 }, (_, index) =>
				toolUse('list_meal_types', {}, `toolu_${index}`)
			);
			respondWith(...blocks);
			await go();
			expect(mcp.callTool).toHaveBeenCalledTimes(MAX_TOOL_CALLS_PER_RESPONSE);
			const results = toolResultsSent();
			expect(results.map((result) => result.tool_use_id)).toEqual(blocks.map((block) => block.id));
			expect(results.slice(0, MAX_TOOL_CALLS_PER_RESPONSE).some((result) => result.is_error)).toBe(
				false
			);
			expect(results.at(-1)).toEqual({
				type: 'tool_result',
				tool_use_id: `toolu_${MAX_TOOL_CALLS_PER_RESPONSE}`,
				content: JSON.stringify({
					error: 'Too many tool calls in one response. Make fewer calls per turn.'
				}),
				is_error: true
			});
		});

		test('passes an empty argument object when the model sent something else', async () => {
			respondWith(toolUse('list_meal_types', ['unexpected'] as never, 'toolu_1'));
			await go();
			expect(insertsOf(T.toolCalls)[0]).toMatchObject({ input: {} });
			expect(mcp.callTool).toHaveBeenCalledWith('list_meal_types', {});
		});

		test('runs a read tool through MCP and reports it as a tool part', async () => {
			mcp.callTool.mockResolvedValue(toolOk({ foods: [{ name: 'Greek yogurt' }] }));
			respondWith(toolUse('search_foods', { query: 'yogurt' }, 'toolu_1'));
			await go();
			expect(insertsOf(T.toolCalls)[0]).toMatchObject({
				toolName: 'search_foods',
				kind: 'read',
				input: { query: 'yogurt' }
			});
			expect(updatesOf(T.toolCalls)[0]).toEqual({ execution: 'started' });
			expect(mcp.callTool).toHaveBeenCalledWith('search_foods', { query: 'yogurt' });
			expect(finishedCalls()).toEqual([
				expect.objectContaining({
					execution: 'succeeded',
					resultText: JSON.stringify({ foods: [{ name: 'Greek yogurt' }] }),
					isError: false,
					changes: []
				})
			]);
			expect(runChanges()).toEqual([]);
			expect(appended().filter((event) => event.type.startsWith('tool_'))).toEqual([
				{
					type: 'tool_started',
					runId: 'run-1',
					messageId: ASSISTANT_ID,
					partIndex: 0,
					toolUseId: 'toolu_1',
					name: 'search_foods',
					label: 'Searching your foods'
				},
				{
					type: 'tool_finished',
					runId: 'run-1',
					messageId: ASSISTANT_ID,
					partIndex: 0,
					toolUseId: 'toolu_1',
					name: 'search_foods',
					status: 'ok',
					summary: null,
					changed: [],
					changes: []
				}
			]);
			expect(h.entryDate).not.toHaveBeenCalled();
		});

		test('records the changes of a write on the call, the run and the event', async () => {
			state.claimed = runRow({ changes: [{ domain: 'foods', ids: ['food-1'] }] as never });
			mcp.callTool.mockResolvedValueOnce(toolOk({ entryId: 'e1' }));
			mcp.callTool.mockResolvedValueOnce(toolOk({ ok: true }));
			respondWith(
				toolUse('log_food', { foodId: 'food-1', servings: 1.5, mealType: 'Breakfast' }, 'toolu_1'),
				toolUse('update_food', { foodId: 'food-2' }, 'toolu_2')
			);
			await go();

			expect(insertsOf(T.toolCalls).map((values) => [values.toolName, values.kind])).toEqual([
				['log_food', 'write'],
				['update_food', 'write']
			]);
			expect(h.entryDate).toHaveBeenCalledWith('user-1', 'e1');
			expect(finishedCalls().map((set) => set.changes)).toEqual([
				[{ domain: 'entries', dates: ['2026-11-18'] }],
				[{ domain: 'foods', ids: ['food-2'] }]
			]);
			expect(runChanges()).toEqual([
				[
					{ domain: 'entries', dates: ['2026-11-18'] },
					{ domain: 'foods', ids: ['food-1'] }
				],
				[
					{ domain: 'entries', dates: ['2026-11-18'] },
					{ domain: 'foods', ids: ['food-1', 'food-2'] }
				]
			]);
			const finished = appended().filter((event) => event.type === 'tool_finished');
			expect(finished.map((event) => [event.changed, event.changes])).toEqual([
				[['entries'], [{ domain: 'entries', dates: ['2026-11-18'] }]],
				[['foods'], [{ domain: 'foods', ids: ['food-2'] }]]
			]);
			expect(
				appended()
					.filter((event) => event.type === 'tool_started')
					.map((event) => event.partIndex)
			).toEqual([0, 1]);
		});

		test('looks the entry date up before and after an update', async () => {
			h.entryDate.mockResolvedValueOnce('2026-11-17').mockResolvedValueOnce('2026-11-18');
			respondWith(toolUse('update_entry', { entryId: 'e1', servings: 2 }, 'toolu_1'));
			await go();
			expect(h.entryDate.mock.calls).toEqual([
				['user-1', 'e1'],
				['user-1', 'e1']
			]);
			expect(h.entryDate.mock.invocationCallOrder[0]).toBeLessThan(
				mcp.callTool.mock.invocationCallOrder[0]!
			);
			expect(runChanges()).toEqual([[{ domain: 'entries', dates: ['2026-11-17', '2026-11-18'] }]]);
		});

		test("resolves today in the user's time zone for a write without a date", async () => {
			h.userToday.mockResolvedValue('2026-11-19');
			respondWith(toolUse('log_supplement', { supplementId: 'sup-1' }, 'toolu_1'));
			await go();
			expect(h.userToday).toHaveBeenCalledWith('user-1');
			expect(runChanges()).toEqual([
				[
					{ domain: 'entries', dates: ['2026-11-19'] },
					{ domain: 'supplements', ids: ['sup-1'] }
				]
			]);
		});

		test('turns a thrown tool call into an error result and reports it', async () => {
			const failure = new Error('transport closed');
			mcp.callTool.mockRejectedValue(failure);
			respondWith(toolUse('log_food', { foodId: 'food-1' }, 'toolu_1'));
			await go();
			const text = JSON.stringify({ error: 'The tool could not be run.' });
			expect(h.captureException).toHaveBeenCalledWith(failure, {
				tags: { job: 'chat-tool' },
				extra: { tool: 'log_food' }
			});
			expect(finishedCalls()).toEqual([
				expect.objectContaining({
					execution: 'failed',
					resultText: text,
					isError: true,
					changes: []
				})
			]);
			expect(runChanges()).toEqual([]);
			expect(appended().find((event) => event.type === 'tool_finished')).toMatchObject({
				status: 'error',
				summary: text,
				changed: [],
				changes: []
			});
			expect(resultText()).toEqual({
				type: 'tool_result',
				tool_use_id: 'toolu_1',
				content: text,
				is_error: true
			});
			expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
		});

		test.each([
			[
				'an MCP error result',
				{ isError: true, content: [{ type: 'text', text: 'Food not found' }] },
				'Food not found'
			],
			[
				'an error in the structured result',
				toolOk({ error: 'foodId must be a UUID' }),
				'foodId must be a UUID'
			]
		])('marks %s as failed and records no changes', async (_name, result, summary) => {
			mcp.callTool.mockResolvedValue(result);
			respondWith(toolUse('log_food', { foodId: 'nope' }, 'toolu_1'));
			await go();
			expect(finishedCalls()).toEqual([
				expect.objectContaining({ execution: 'failed', isError: true, changes: [] })
			]);
			expect(h.entryDate).not.toHaveBeenCalled();
			expect(runChanges()).toEqual([]);
			expect(appended().find((event) => event.type === 'tool_finished')).toMatchObject({
				status: 'error',
				summary
			});
			expect(resultText()).toMatchObject({ tool_use_id: 'toolu_1', is_error: true });
		});
	});

	describe('confirmations', () => {
		const removal = () => toolUse('delete_entry', { entryId: 'e1' }, 'toolu_1');

		test('answers with an error and does not ask when the preview cannot be built', async () => {
			h.buildActionPreview.mockResolvedValue({ error: 'Entry not found.' });
			respondWith(removal());
			await go();
			expect(h.buildActionPreview).toHaveBeenCalledWith(
				'delete_entry',
				{ entryId: 'e1' },
				{ userId: 'user-1', locale: 'en', today: expect.any(Function) }
			);
			const context = h.buildActionPreview.mock.calls[0]![2] as { today: () => Promise<string> };
			await expect(context.today()).resolves.toBe('2026-11-18');
			expect(h.userToday).toHaveBeenCalledWith('user-1');
			expect(insertsOf(T.toolCalls)[0]).toMatchObject({
				toolName: 'delete_entry',
				kind: 'confirm'
			});
			const text = JSON.stringify({ error: 'Entry not found.' });
			expect(resultText()).toEqual({
				type: 'tool_result',
				tool_use_id: 'toolu_1',
				content: text,
				is_error: true
			});
			expect(updatesOf(T.toolCalls)[0]).toMatchObject({ resultText: text, isError: true });
			expect(mcp.callTool).not.toHaveBeenCalled();
			expect(appended().some((event) => event.type === 'action_required')).toBe(false);
			expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
		});

		test('stores a pending action, asks the user and pauses the run', async () => {
			const preview = { summary: 'Delete “Greek yogurt”', details: ['2 servings · 120 kcal'] };
			h.buildActionPreview.mockResolvedValue({ preview });
			script(message([text('I will delete it.'), removal()], 'tool_use'));
			await go();

			const expiresAt = new Date(NOW.getTime() + ACTION_TTL_MS);
			expect(updatesOf(T.toolCalls)).toEqual([
				expect.objectContaining({ actionStatus: 'pending', preview, partIndex: 1, expiresAt })
			]);
			expect(mcp.callTool).not.toHaveBeenCalled();
			const required = appended().find((event) => event.type === 'action_required')!;
			expect(required).toMatchObject({
				runId: 'run-1',
				messageId: ASSISTANT_ID,
				partIndex: 1,
				action: {
					id: 'call-1',
					conversationId: 'conv-1',
					runId: 'run-1',
					messageId: ASSISTANT_ID,
					toolUseId: 'toolu_1',
					name: 'delete_entry',
					label: 'Deleting an entry',
					status: 'pending',
					preview,
					expiresAt: expiresAt.toISOString()
				}
			});

			expect(updatesOf(T.runs).find((set) => set.status === 'awaiting_confirmation')).toMatchObject(
				{
					leaseOwner: null,
					heartbeatAt: null,
					iterations: 1
				}
			);
			expect(updatesOf(T.messages)).toEqual([
				expect.objectContaining({
					parts: [
						{ type: 'text', text: 'I will delete it.' },
						{
							type: 'action',
							actionId: 'call-1',
							toolUseId: 'toolu_1',
							name: 'delete_entry',
							label: 'Deleting an entry',
							status: 'pending',
							preview,
							expiresAt: expiresAt.toISOString()
						}
					]
				})
			]);
			const eventOrder = h.appendEvents.mock.invocationCallOrder.at(-1)!;
			expect(eventOrder).toBeLessThan(h.finalizeRun.mock.invocationCallOrder[0] ?? Infinity);
			expect(h.finalizeRun).not.toHaveBeenCalled();
			expect(persisted().map((turn) => turn.role)).toEqual(['assistant']);
			expect(h.callClaude).toHaveBeenCalledTimes(1);
			expect(mcp.close).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		});

		test('pauses at the confirmation but has already run the calls before it', async () => {
			h.buildActionPreview.mockResolvedValue({ preview: { summary: 'Delete', details: [] } });
			script(message([toolUse('search_foods', { query: 'x' }, 'toolu_0'), removal()], 'tool_use'));
			await go();
			expect(mcp.callTool).toHaveBeenCalledTimes(1);
			expect(mcp.callTool).toHaveBeenCalledWith('search_foods', { query: 'x' });
			expect(persisted().map((turn) => turn.role)).toEqual(['assistant']);
			expect(updatesOf(T.messages)[0]!.parts.map((part: { type: string }) => part.type)).toEqual([
				'tool',
				'action'
			]);
		});

		test('drops the run silently when its lease is gone while pausing', async () => {
			state.lookups = [toolCallRow({ actionStatus: 'pending' })];
			state.pauseOk = false;
			script(message([removal()], 'tool_use'));
			await go();
			expect(updatesOf(T.messages)).toEqual([]);
			expect(h.finalizeRun).not.toHaveBeenCalled();
			expect(h.captureException).not.toHaveBeenCalled();
			expect(mcp.close).toHaveBeenCalledTimes(1);
		});
	});

	test('stops answering tool calls once the run was aborted', async () => {
		stop = 'cancel';
		mcp.callTool.mockImplementation(async () => {
			controller.abort();
			return toolOk({ ok: true });
		});
		script(
			message(
				[toolUse('list_meal_types', {}, 'toolu_1'), toolUse('list_meal_types', {}, 'toolu_2')],
				'tool_use'
			)
		);
		await go();
		expect(mcp.callTool).toHaveBeenCalledTimes(1);
		expect(persisted().map((turn) => turn.role)).toEqual(['assistant']);
		expect(finalized()).toEqual([
			{ status: 'cancelled', reason: 'user_cancelled', instanceId: 'inst-1' }
		]);
	});
});

describe('failures', () => {
	test('fails the run with the code of a closed gate before calling Claude', async () => {
		h.assertClaudeGates.mockRejectedValue(new ClaudeGateError('user_budget_exhausted'));
		await go();
		expect(h.callClaude).not.toHaveBeenCalled();
		expect(finalized()).toEqual([
			{ status: 'failed', reason: 'user_budget_exhausted', instanceId: 'inst-1' }
		]);
		expect(h.captureException).not.toHaveBeenCalled();
		expect(mcp.close).toHaveBeenCalledTimes(1);
	});

	test('fails the run with the gate error thrown by the call itself', async () => {
		script(new ClaudeGateError('global_budget_exhausted'));
		await go();
		expect(finalized()).toEqual([
			{ status: 'failed', reason: 'global_budget_exhausted', instanceId: 'inst-1' }
		]);
	});

	test('fails with api_error without reporting a Claude API error', async () => {
		script(new ClaudeApiError({ kind: 'server', status: 500, retryable: true }));
		await go();
		expect(finalized()).toEqual([{ status: 'failed', reason: 'api_error', instanceId: 'inst-1' }]);
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('reports an unexpected error and fails with internal_error', async () => {
		const failure = new Error('boom');
		script(failure);
		await go();
		expect(h.captureException).toHaveBeenCalledTimes(1);
		expect(h.captureException).toHaveBeenCalledWith(failure, { tags: { job: 'chat-run' } });
		expect(finalized()).toEqual([
			{ status: 'failed', reason: 'internal_error', instanceId: 'inst-1' }
		]);
	});

	test('fails a run that broke before it had a context and never connected MCP', async () => {
		const failure = new Error('snapshot failed');
		h.ensurePromptSnapshot.mockRejectedValue(failure);
		await go();
		expect(h.connectMcp).not.toHaveBeenCalled();
		expect(h.appendEvents).not.toHaveBeenCalled();
		expect(h.captureException).toHaveBeenCalledWith(failure, { tags: { job: 'chat-run' } });
		expect(finalized()).toEqual([
			{ status: 'failed', reason: 'internal_error', instanceId: 'inst-1' }
		]);
		expect(mcp.close).not.toHaveBeenCalled();
	});

	test('drops pending text without writing it when the conversation was deleted', async () => {
		stop = 'deleted';
		script(async (options) => {
			options.stream.onText('never stored');
			throw new ClaudeAbortedError();
		});
		await go();
		expect(vi.getTimerCount()).toBe(0);
		expect(appended()).toEqual([]);
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(mcp.close).toHaveBeenCalledTimes(1);
	});

	test('writes the partial text before the run is finalized', async () => {
		script(async (options) => {
			options.stream.onText('Half an ans');
			throw new ClaudeApiError({ kind: 'connection', retryable: true });
		});
		await go();
		expect(textDeltas()).toEqual([
			{
				type: 'text_delta',
				runId: 'run-1',
				messageId: ASSISTANT_ID,
				partIndex: 0,
				text: 'Half an ans'
			}
		]);
		expect(h.appendEvents.mock.invocationCallOrder[0]).toBeLessThan(
			h.finalizeRun.mock.invocationCallOrder[0]!
		);
		expect(h.appendRaw).not.toHaveBeenCalled();
	});

	test('reports a failed flush while winding down and still finalizes', async () => {
		const failure = new Error('db down');
		h.appendEvents.mockRejectedValue(failure);
		script(async (options) => {
			options.stream.onText('partial');
			throw new ClaudeApiError({ kind: 'timeout', retryable: true });
		});
		await go();
		expect(h.captureException).toHaveBeenCalledWith(failure, { tags: { job: 'chat-run' } });
		expect(finalized()).toEqual([{ status: 'failed', reason: 'api_error', instanceId: 'inst-1' }]);
	});

	describe('an aborted call', () => {
		const aborted = () => script(new ClaudeAbortedError());

		test('leaves a run alone whose conversation was deleted', async () => {
			stop = 'deleted';
			aborted();
			await go();
			expect(h.finalizeRun).not.toHaveBeenCalled();
			expect(h.assertClaudeGates).toHaveBeenCalledTimes(1);
			expect(h.captureException).not.toHaveBeenCalled();
		});

		test('cancels a run the user stopped', async () => {
			stop = 'cancel';
			aborted();
			await go();
			expect(finalized()).toEqual([
				{ status: 'cancelled', reason: 'user_cancelled', instanceId: 'inst-1' }
			]);
		});

		test('fails a run whose gate closed with the gate code', async () => {
			stop = 'gate';
			script(async () => {
				h.assertClaudeGates.mockRejectedValue(new ClaudeGateError('disabled'));
				throw new ClaudeAbortedError();
			});
			await go();
			expect(finalized()).toEqual([{ status: 'failed', reason: 'disabled', instanceId: 'inst-1' }]);
		});

		test('ends a run stopped for a gate that reopened as interrupted', async () => {
			stop = 'gate';
			aborted();
			await go();
			expect(finalized()).toEqual([
				{ status: 'interrupted', reason: 'server_restart', instanceId: 'inst-1' }
			]);
			expect(h.assertClaudeGates).toHaveBeenCalledTimes(2);
			expect(mcp.close).toHaveBeenCalledTimes(1);
		});

		test('lets an unexpected error of the gate check escape and still closes MCP', async () => {
			script(async () => {
				h.assertClaudeGates.mockRejectedValue(new Error('gate lookup failed'));
				throw new ClaudeAbortedError();
			});
			await expect(go()).rejects.toThrow('gate lookup failed');
			expect(h.finalizeRun).not.toHaveBeenCalled();
			expect(mcp.close).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		});

		test('cancels before calling Claude when the signal fired already', async () => {
			stop = 'cancel';
			controller.abort();
			await go();
			expect(h.callClaude).not.toHaveBeenCalled();
			expect(finalized()).toEqual([
				{ status: 'cancelled', reason: 'user_cancelled', instanceId: 'inst-1' }
			]);
		});

		test('hands the abort of the owner to the running call', async () => {
			stop = 'cancel';
			script(
				(options) =>
					new Promise((_resolve, reject) => {
						options.signal.addEventListener('abort', () => reject(new ClaudeAbortedError()));
						controller.abort();
					})
			);
			await go();
			expect(finalized()).toEqual([
				{ status: 'cancelled', reason: 'user_cancelled', instanceId: 'inst-1' }
			]);
		});
	});

	test('reports a failing MCP close without failing the run', async () => {
		const failure = new Error('close failed');
		mcp.close.mockRejectedValue(failure);
		script(message([text('Hi')]));
		await expect(go()).resolves.toBeUndefined();
		expect(h.captureException).toHaveBeenCalledWith(failure, { tags: { job: 'chat-mcp-close' } });
		expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
	});
});

describe('the heartbeat', () => {
	const heartbeats = () =>
		updatesOf(T.runs).filter((set) => Object.keys(set).join() === 'heartbeatAt');
	const hold = () => {
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		script(async (options) => {
			await held;
			if (options.signal.aborted) throw new ClaudeAbortedError();
			return message([text('Done')]);
		});
		return release;
	};

	test('beats at the default interval while the run is working', async () => {
		const release = hold();
		const running = go();
		await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS - 1);
		expect(heartbeats()).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(heartbeats()).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
		expect(heartbeats()).toHaveLength(2);
		release();
		await running;
		expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
		expect(heartbeats()).toHaveLength(2);
	});

	test('honours a custom interval', async () => {
		const release = hold();
		const running = go({ heartbeatMs: 1000 });
		await vi.advanceTimersByTimeAsync(2500);
		expect(heartbeats()).toHaveLength(2);
		release();
		await running;
	});

	test('aborts the call and walks away without finalizing when the lease is lost', async () => {
		state.heartbeatAlive = false;
		const release = hold();
		const running = go({ heartbeatMs: 1000 });
		await vi.advanceTimersByTimeAsync(1000);
		release();
		await running;
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(h.captureException).not.toHaveBeenCalled();
		expect(stopReason).not.toHaveBeenCalled();
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(mcp.close).toHaveBeenCalledTimes(1);
	});

	test('reports a failed heartbeat and keeps working', async () => {
		const failure = new Error('db blip');
		state.heartbeatError = failure;
		const release = hold();
		const running = go({ heartbeatMs: 1000 });
		await vi.advanceTimersByTimeAsync(1000);
		expect(h.captureException).toHaveBeenCalledWith(failure, { tags: { job: 'chat-heartbeat' } });
		release();
		await running;
		expect(finalized()).toEqual([{ status: 'completed', reason: null, instanceId: 'inst-1' }]);
	});
});
