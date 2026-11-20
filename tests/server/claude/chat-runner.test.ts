import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { getTableName } from 'drizzle-orm';
import {
	chatConversations,
	chatMessages,
	foodEntries,
	foods,
	chatRuns,
	chatToolCalls,
	claudeAccess,
	recipeIngredients,
	recipes,
	users,
	type ChatRun,
	type ChatToolCall
} from '$lib/server/schema';
import {
	ACTION_TTL_MS,
	CHAT_MAX_TOKENS,
	HEARTBEAT_INTERVAL_MS,
	MAX_TOOL_CALLS_PER_RESPONSE,
	MAX_UNCONFIRMED_WRITES_PER_RUN,
	RETRY_DELAYS_MS,
	TEXT_FLUSH_MS
} from '$lib/server/claude/chat/constants';
import { subscribeConversation } from '$lib/server/claude/chat/events';
import {
	DECLINED_RESULT,
	abortableSleep,
	executeChatRun,
	type StopReason
} from '$lib/server/claude/chat/runner';
import {
	ClaudeAbortedError,
	ClaudeApiError,
	ClaudeGateError,
	type ClaudeApiErrorTopic
} from '$lib/server/claude/errors';
import {
	CLAUDE_MODELS,
	isWebFetchAccepted,
	isWebFetchRejected,
	rejectWebFetch,
	resetWebFetchForTests
} from '$lib/server/claude/models';

const h = vi.hoisted(() => ({
	callClaude: vi.fn(),
	assertClaudeGates: vi.fn(),
	finalizeRun: vi.fn(),
	appendEvents: vi.fn(),
	getConversation: vi.fn(),
	entryDate: vi.fn(),
	userToday: vi.fn(),
	loadRaw: vi.fn(),
	appendRaw: vi.fn(),
	ensurePromptSnapshot: vi.fn(),
	storePromptSnapshot: vi.fn(),
	hydrate: vi.fn(),
	connectMcp: vi.fn(),
	buildActionPreview: vi.fn(),
	loadDayDetails: vi.fn(),
	loadAssistantLabels: vi.fn(),
	parseToolInput: vi.fn(),
	captureException: vi.fn(),
	captureMessage: vi.fn(),
	config: { model: 'claude-opus-5-5', effort: 'medium', maxIterations: 10 }
}));

type Query = {
	op: 'select' | 'insert' | 'update';
	table: string;
	fields?: Record<string, unknown>;
	values?: Record<string, any>;
	set?: Record<string, any>;
	joined?: string[];
	tx: number | null;
};

const txStore = new AsyncLocalStorage<number>();
let txCount = 0;

const queries: Query[] = [];
let handle: (query: Query) => unknown = () => [];

function builder(op: Query['op'], table?: unknown, fields?: Record<string, unknown>) {
	const query: Query = {
		op,
		table: table ? getTableName(table as never) : '',
		fields,
		tx: txStore.getStore() ?? null
	};
	queries.push(query);
	const api: Record<string, unknown> = {
		from: (from: unknown) => {
			query.table = getTableName(from as never);
			return api;
		},
		innerJoin: (joined: unknown) => {
			(query.joined ??= []).push(getTableName(joined as never));
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
		limit: () => api,
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
	transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
		txStore.run(++txCount, () => callback(db))
};

vi.mock('@sentry/sveltekit', () => ({
	captureException: h.captureException,
	captureMessage: h.captureMessage,
	addBreadcrumb: vi.fn(),
	logger: { info: vi.fn() }
}));
vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/preferences', () => ({ getUserTimeZone: vi.fn() }));
vi.mock('$lib/server/claude/call', () => ({ callClaude: h.callClaude }));
vi.mock('$lib/server/claude/capability', () => ({ assertClaudeGates: h.assertClaudeGates }));
vi.mock('$lib/server/claude/config', () => ({ claudeConfig: () => h.config }));
vi.mock('$lib/server/claude/chat/finalize', () => ({ finalizeRun: h.finalizeRun }));
vi.mock('$lib/server/claude/chat/previews', () => ({
	buildActionPreview: h.buildActionPreview,
	loadDayDetails: h.loadDayDetails,
	loadAssistantLabels: h.loadAssistantLabels
}));
vi.mock('$lib/server/claude/chat/events', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/events')>()),
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
	connectMcp: h.connectMcp,
	parseToolInput: h.parseToolInput
}));
vi.mock('$lib/server/claude/chat/transcript', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/transcript')>()),
	loadRaw: h.loadRaw,
	appendRaw: h.appendRaw,
	ensurePromptSnapshot: h.ensurePromptSnapshot,
	storePromptSnapshot: h.storePromptSnapshot,
	hydrate: h.hydrate
}));

const T = {
	runs: getTableName(chatRuns),
	messages: getTableName(chatMessages),
	conversations: getTableName(chatConversations),
	toolCalls: getTableName(chatToolCalls),
	entries: getTableName(foodEntries),
	ingredients: getTableName(recipeIngredients),
	foods: getTableName(foods),
	recipes: getTableName(recipes),
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

const conversation = { id: 'conv-1', userId: 'user-1', promptId: null, promptFromPosition: 0 };
const snapshot = {
	id: 'snap-1',
	system: [{ type: 'text', text: 'system prompt' }],
	tools: [{ name: 'search_foods' }, { name: 'log_food' }],
	fromPosition: 0
};
const FETCH_TOOL = { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 };
const fetchSnapshot = (id: string, fromPosition = 0) => ({
	...snapshot,
	id,
	tools: [{ name: 'search_foods' }, FETCH_TOOL],
	fromPosition
});
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
	leaseSeq: [] as boolean[],
	hasEntries: false,
	inRecipe: false,
	photos: { foods: null, recipes: null } as Record<'foods' | 'recipes', string | null | undefined>,
	writeCount: 0 as number | string | null,
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
			return (state.leaseSeq.length > 0 ? state.leaseSeq.shift() : state.lease)
				? [{ id: 'run-1' }]
				: [];
		case `select:${T.entries}`:
			return state.hasEntries ? [{ id: 'entry-1' }] : [];
		case `select:${T.ingredients}`:
			return state.inRecipe ? [{ id: 'entry-2' }] : [];
		case `select:${T.foods}`:
		case `select:${T.recipes}`: {
			const photo = state.photos[query.table === T.foods ? 'foods' : 'recipes'];
			return photo === undefined ? [] : [{ imageUrl: photo }];
		}
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
			if (query.fields && 'count' in query.fields) {
				return state.writeCount === null ? [] : [{ count: state.writeCount }];
			}
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
			if ('preview' in set) return [{ ...state.lastCall, ...set }];
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
	expectedRejection: (error: unknown) => boolean;
	stream: {
		onText: (delta: string) => void;
		onBlock: (block: Record<string, any>) => void;
		onActivity: () => void;
	};
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
const thinking = (): Block => ({ type: 'thinking', thinking: 'Let me think', signature: 'sig' });
const redactedThinking = (): Block => ({ type: 'redacted_thinking', data: 'opaque' });
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

const sleep = vi.fn<(ms: number, signal: AbortSignal) => Promise<void>>();

const go = (
	overrides: {
		heartbeatMs?: number;
		sleep?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined;
	} = {}
) =>
	executeChatRun('run-1', {
		signal: controller.signal,
		instanceId: 'inst-1',
		stopReason,
		sleep,
		...overrides
	});

const drain = () => vi.advanceTimersByTimeAsync(0);
type Event = Record<string, any>;
const START_EVENTS = ['run_started', 'run_resumed'];
const appendedAll = () => h.appendEvents.mock.calls.flatMap(([, , events]) => events as Event[]);
const appended = () => appendedAll().filter((event) => !START_EVENTS.includes(event.type));
const startEvents = () => appendedAll().filter((event) => START_EVENTS.includes(event.type));
const failEventWrites = (error: Error) =>
	h.appendEvents.mockImplementation(async (_tx: unknown, _id: string, events: Event[]) => {
		if (events.some((event) => !START_EVENTS.includes(event.type))) throw error;
		return [];
	});
const queriesAtEvent: Record<string, string[]> = {};
const txAtEvent: Record<string, number | undefined> = {};
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
	resetWebFetchForTests();
	for (const key of Object.keys(queriesAtEvent)) delete queriesAtEvent[key];
	for (const key of Object.keys(txAtEvent)) delete txAtEvent[key];
	for (const fn of [
		...Object.values(h),
		mcp.callTool,
		mcp.listTools,
		mcp.close,
		stopReason,
		sleep
	]) {
		if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset();
	}
	stopReason.mockImplementation(() => stop);
	h.getConversation.mockResolvedValue(conversation);
	h.ensurePromptSnapshot.mockResolvedValue(snapshot);
	h.loadRaw.mockImplementation(async () => [structuredClone(userTurn)]);
	h.appendRaw.mockResolvedValue(undefined);
	h.appendEvents.mockImplementation(async (_tx: unknown, _id: string, events: Event[]) => {
		for (const event of events) {
			queriesAtEvent[event.type] = queries.map((query) => `${query.op}:${query.table}`);
			txAtEvent[event.type] = txStore.getStore();
		}
		return [];
	});
	sleep.mockResolvedValue(undefined);
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
	h.parseToolInput.mockImplementation(async (_name: string, input: Record<string, unknown>) => ({
		input
	}));
	h.loadDayDetails.mockResolvedValue(null);
	h.loadAssistantLabels.mockResolvedValue([]);
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
		expect(startEvents()).toEqual([
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
		expect(h.appendEvents.mock.calls[0]).toEqual([db, 'conv-1', startEvents()]);
		expect(h.ensurePromptSnapshot).toHaveBeenCalledWith(conversation, 'claude-opus-5-5', {
			transcriptLength: 1
		});
		expect(h.connectMcp).toHaveBeenCalledWith('user-1');
		expect(h.loadRaw).toHaveBeenCalledWith(db, 'conv-1');
		expect(h.hydrate).toHaveBeenCalledWith('user-1', [userTurn], expect.any(Map), 0);
		expect(h.appendEvents.mock.invocationCallOrder[0]).toBeLessThan(
			h.loadRaw.mock.invocationCallOrder[0]!
		);
		expect(h.loadRaw.mock.invocationCallOrder[0]).toBeLessThan(
			h.ensurePromptSnapshot.mock.invocationCallOrder[0]!
		);

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
			expectedRejection: expect.any(Function),
			stream: {
				onText: expect.any(Function),
				onBlock: expect.any(Function),
				onActivity: expect.any(Function)
			}
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
		expect(startEvents()).toEqual([
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
		expect(startEvents()).toEqual([
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
		expect(h.ensurePromptSnapshot).toHaveBeenCalledWith(conversation, picked, {
			transcriptLength: 1
		});
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
		failEventWrites(failure);
		script(message([serverSearch('srv_1'), searchResult('srv_1'), text('Found it.')]));
		await go();
		expect(appendedAll().map((event) => event.type)).toEqual(['run_started', 'tool_started']);
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
		script(async (options) => {
			state.lease = false;
			options.stream.onText('Hello');
			return message([text('Hello')]);
		});
		await go();
		expect(appended()).toEqual([]);
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

	test.each([
		['thinking', [thinking()]],
		['redacted thinking', [redactedThinking()]],
		['both kinds of thinking', [thinking(), redactedThinking()]]
	])('keeps a turn of only %s out of the transcript', async (_name, blocks) => {
		script(message(blocks, 'max_tokens'));
		await go();
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(finalized()).toEqual([
			{ status: 'completed', reason: 'output_limit', instanceId: 'inst-1' }
		]);
	});

	test('keeps a finished turn of only thinking out of the transcript too', async () => {
		script(message([thinking()]));
		await go();
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(finalized()).toEqual([completed]);
	});

	test.each([
		['an answer', [thinking(), text('Done')]],
		['redacted thinking and an answer', [redactedThinking(), text('Done')]],
		['a tool call that was answered', [thinking(), serverSearch('srv_1'), searchResult('srv_1')]]
	])('keeps a turn of thinking and %s', async (_name, blocks) => {
		script(message(blocks, 'max_tokens'));
		await go();
		expect(persisted()).toEqual([{ role: 'assistant', content: blocks }]);
	});

	test('keeps the thinking of a turn that calls a tool', async () => {
		const first = [thinking(), toolUse('list_meal_types', {}, 'toolu_1')];
		script(message(first, 'tool_use'), message([text('Done')]));
		await go();
		expect(persisted()[0]).toEqual({ role: 'assistant', content: first });
		expect(persisted().map((turn) => turn.role)).toEqual(['assistant', 'user', 'assistant']);
	});

	test('drops a thinking-only turn buffered by pause_turn and persists the answer', async () => {
		const answer = [text('Done')];
		script(message([thinking()], 'pause_turn'), message(answer));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(secondRequestMessages().at(-1)).toMatchObject({
			role: 'assistant',
			content: [thinking()]
		});
		expect(persisted()).toEqual([{ role: 'assistant', content: answer }]);
		expect(h.appendRaw).toHaveBeenCalledTimes(1);
		expect(finalized()).toEqual([completed]);
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
			expect(updatesOf(T.toolCalls)).toEqual([]);
			expect(appendedAll().map((event) => event.type)).toEqual(['run_started']);
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

		test('runs the input stored with the approved action, not the one the model sent', async () => {
			state.claimed = runRow({ assistantMessageId: ASSISTANT_ID, iterations: 1 });
			state.lookups = [
				toolCallRow({
					actionStatus: 'approved',
					toolName: 'delete_entry',
					input: { entryId: 'e1', date: '2026-11-18' }
				})
			];
			h.loadRaw.mockResolvedValue([
				userTurn,
				{
					role: 'assistant',
					content: [toolUse('delete_entry', { entryId: 'e1', date: 'today' }, 'toolu_1')]
				}
			]);
			script(message([text('Deleted.')]));
			await go();
			expect(mcp.callTool).toHaveBeenCalledTimes(1);
			expect(mcp.callTool).toHaveBeenCalledWith('delete_entry', {
				entryId: 'e1',
				date: '2026-11-18'
			});
			expect(h.entryDate).toHaveBeenCalledWith('user-1', 'e1');
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
			const normalised = { entryId: 'e1', date: '2026-11-18' };
			h.buildActionPreview.mockResolvedValue({ preview, input: normalised });
			script(message([text('I will delete it.'), removal()], 'tool_use'));
			await go();

			const expiresAt = new Date(NOW.getTime() + ACTION_TTL_MS);
			expect(updatesOf(T.toolCalls)).toEqual([
				{ input: normalised, preview, partIndex: 1, expiresAt },
				{ actionStatus: 'pending' }
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
			expect(appendedAll().filter((event) => event.type === 'action_required')).toHaveLength(1);
			expect(h.appendEvents.mock.calls.at(-1)).toEqual([db, 'conv-1', [required]]);
			expect(queriesAtEvent.action_required!.slice(-4)).toEqual([
				`select:${T.conversations}`,
				`update:${T.runs}`,
				`update:${T.messages}`,
				`update:${T.toolCalls}`
			]);
			expect(h.finalizeRun).not.toHaveBeenCalled();
			expect(persisted().map((turn) => turn.role)).toEqual(['assistant']);
			expect(h.callClaude).toHaveBeenCalledTimes(1);
			expect(mcp.close).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		});

		test('turns the action pending only inside the transaction that pauses the run, before its event', async () => {
			h.buildActionPreview.mockResolvedValue({
				preview: { summary: 'Delete', details: [] },
				input: { entryId: 'e1' }
			});
			script(message([removal()], 'tool_use'));
			await go();

			const calls = writes('update', T.toolCalls);
			const [stored, pending] = calls;
			const pause = writes('update', T.runs).find(
				(query) => query.set!.status === 'awaiting_confirmation'
			)!;
			expect(calls).toHaveLength(2);
			expect(stored!.set).not.toHaveProperty('actionStatus');
			expect(pending!.set).toEqual({ actionStatus: 'pending' });
			expect(pause.tx).not.toBeNull();
			expect(stored!.tx).not.toBeNull();
			expect(stored!.tx).not.toBe(pause.tx);
			expect(pending!.tx).toBe(pause.tx);
			expect(txAtEvent.action_required).toBe(pause.tx);
			expect(queries.indexOf(stored!)).toBeLessThan(queries.indexOf(pause));
			expect(queries.indexOf(pause)).toBeLessThan(queries.indexOf(pending!));
			expect(queriesAtEvent.action_required).toContain(`update:${T.toolCalls}`);
			expect(queriesAtEvent.action_required!.at(-1)).toBe(`update:${T.toolCalls}`);
			expect(appendedAll().filter((event) => event.type === 'action_required')).toHaveLength(1);
		});

		test('serializes the action as pending although the stored row is not yet', async () => {
			h.buildActionPreview.mockResolvedValue({
				preview: { summary: 'Delete', details: [] },
				input: { entryId: 'e1' }
			});
			script(message([removal()], 'tool_use'));
			await go();
			const required = appended().find((event) => event.type === 'action_required')!;
			expect(required.action.status).toBe('pending');
			expect(updatesOf(T.toolCalls)[0]).not.toHaveProperty('actionStatus');
		});

		test('pauses at the confirmation but has already run the calls before it', async () => {
			h.buildActionPreview.mockResolvedValue({
				preview: { summary: 'Delete', details: [] },
				input: { entryId: 'e1' }
			});
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
			h.buildActionPreview.mockResolvedValue({
				preview: { summary: 'Delete', details: [] },
				input: { entryId: 'e1' }
			});
			state.pauseOk = false;
			script(message([removal()], 'tool_use'));
			await go();
			expect(updatesOf(T.messages)).toEqual([]);
			expect(updatesOf(T.toolCalls)).toHaveLength(1);
			expect(updatesOf(T.toolCalls).some((set) => 'actionStatus' in set)).toBe(false);
			expect(appendedAll().some((event) => event.type === 'action_required')).toBe(false);
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
		script(new ClaudeApiError({ kind: 'auth', status: 401, retryable: false }));
		await go();
		expect(finalized()).toEqual([{ status: 'failed', reason: 'api_error', instanceId: 'inst-1' }]);
		expect(h.captureException).not.toHaveBeenCalled();
		expect(sleep).not.toHaveBeenCalled();
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
		expect(appendedAll().map((event) => event.type)).toEqual(['run_started']);
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
		failEventWrites(failure);
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

const completed = { status: 'completed', reason: null, instanceId: 'inst-1' };
const failedWith = (reason: string) => ({ status: 'failed', reason, instanceId: 'inst-1' });
const withContainer = (response: Anthropic.Message, id: string) =>
	({ ...response, container: { id, expires_at: '2026-11-18T11:00:00Z' } }) as Anthropic.Message;
const transient = () => new ClaudeApiError({ kind: 'rate_limited', status: 429, retryable: true });
const badRequest = (topic?: ClaudeApiErrorTopic) =>
	new ClaudeApiError({ kind: 'invalid_request', status: 400, retryable: false, topic });
const rejection = () => badRequest('web_fetch');
const tooLong = () => badRequest('prompt_too_long');

describe('starting under the lease', () => {
	test('writes the assistant message and run_started in one fenced transaction', async () => {
		script(message([text('Hi')]));
		await go();
		expect(queriesAtEvent.run_started!.slice(-4)).toEqual([
			`select:${T.conversations}`,
			`select:${T.runs}`,
			`insert:${T.messages}`,
			`update:${T.runs}`
		]);
	});

	test('resumes a message in the same fenced transaction', async () => {
		state.claimed = runRow({ assistantMessageId: 'msg-asst-9' });
		script(message([text('Hi')]));
		await go();
		expect(queriesAtEvent.run_resumed!.slice(-4)).toEqual([
			`select:${T.conversations}`,
			`select:${T.runs}`,
			`select:${T.messages}`,
			`update:${T.runs}`
		]);
	});

	test('writes nothing and never connects MCP when the lease is already gone', async () => {
		state.leaseSeq = [false];
		script(message([text('Hi')]));
		await go();
		expect(insertsOf(T.messages)).toEqual([]);
		expect(updatesOf(T.runs)).toHaveLength(1);
		expect(h.appendEvents).not.toHaveBeenCalled();
		expect(h.loadRaw).not.toHaveBeenCalled();
		expect(h.connectMcp).not.toHaveBeenCalled();
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(h.captureException).not.toHaveBeenCalled();
		expect(mcp.close).not.toHaveBeenCalled();
	});

	test('does not resume a message for a run whose lease is gone', async () => {
		state.claimed = runRow({ assistantMessageId: 'msg-asst-9' });
		state.leaseSeq = [false];
		await go();
		expect(updatesOf(T.runs)).toHaveLength(1);
		expect(h.appendEvents).not.toHaveBeenCalled();
		expect(h.finalizeRun).not.toHaveBeenCalled();
	});

	test('stops before the first call when the lease is lost after starting', async () => {
		state.leaseSeq = [true, false];
		await go();
		expect(h.assertClaudeGates).not.toHaveBeenCalled();
		expect(h.callClaude).not.toHaveBeenCalled();
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(h.captureException).not.toHaveBeenCalled();
		expect(stopReason).not.toHaveBeenCalled();
		expect(mcp.close).toHaveBeenCalledTimes(1);
	});

	test('checks the lease before answering tool calls', async () => {
		state.leaseSeq = [true, true, true, false];
		script(
			message([toolUse('list_meal_types', {}, 'toolu_1')], 'tool_use'),
			message([text('Never asked')])
		);
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(h.assertClaudeGates).toHaveBeenCalledTimes(1);
		expect(mcp.callTool).not.toHaveBeenCalled();
		expect(insertsOf(T.toolCalls)).toEqual([]);
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(h.captureException).not.toHaveBeenCalled();
	});
});

describe('tool input as the tool parses it', () => {
	const FOOD = '6f1c1f0e-3b0a-4b8e-9d57-0c1d2e3f4a5b';

	test('decides, stores and runs a write with the parsed input', async () => {
		h.parseToolInput.mockResolvedValue({ input: { foodId: FOOD, isFavorite: true } });
		script(
			message(
				[toolUse('update_food', { foodId: FOOD, isFavorite: 'false', junk: 1 }, 'toolu_1')],
				'tool_use'
			),
			message([text('Done')])
		);
		await go();
		expect(h.parseToolInput).toHaveBeenCalledWith('update_food', {
			foodId: FOOD,
			isFavorite: 'false',
			junk: 1
		});
		expect(insertsOf(T.toolCalls)[0]).toMatchObject({
			kind: 'write',
			input: { foodId: FOOD, isFavorite: true }
		});
		expect(mcp.callTool).toHaveBeenCalledWith('update_food', { foodId: FOOD, isFavorite: true });
	});

	test('builds the card from the parsed input', async () => {
		h.parseToolInput.mockResolvedValue({ input: { entryId: 'e1' } });
		h.buildActionPreview.mockResolvedValue({
			preview: { summary: 'Delete', details: [] },
			input: { entryId: 'e1', date: '2026-11-18' }
		});
		script(
			message([toolUse('delete_entry', { entryId: 'e1', extra: 'x' }, 'toolu_1')], 'tool_use')
		);
		await go();
		expect(h.buildActionPreview).toHaveBeenCalledWith(
			'delete_entry',
			{ entryId: 'e1' },
			expect.anything()
		);
		expect(insertsOf(T.toolCalls)[0]).toMatchObject({ input: { entryId: 'e1' } });
	});

	test('answers a call the tool cannot parse with an error and runs nothing', async () => {
		h.parseToolInput.mockResolvedValue({
			error: 'Invalid arguments for update_food: calories: bad'
		});
		script(
			message([toolUse('update_food', { foodId: FOOD, calories: 'lots' }, 'toolu_1')], 'tool_use'),
			message([text('Sorry')])
		);
		await go();
		expect(insertsOf(T.toolCalls)[0]).toMatchObject({
			kind: 'write',
			input: { foodId: FOOD, calories: 'lots' }
		});
		expect(mcp.callTool).not.toHaveBeenCalled();
		expect(h.buildActionPreview).not.toHaveBeenCalled();
		const [answer] = updatesOf(T.toolCalls);
		expect(answer).toMatchObject({
			resultText: JSON.stringify({ error: 'Invalid arguments for update_food: calories: bad' }),
			isError: true
		});
		expect(finalized()).toEqual([completed]);
	});

	test('passes reads through unparsed', async () => {
		script(
			message([toolUse('search_foods', { query: 'skyr' }, 'toolu_1')], 'tool_use'),
			message([text('Found it')])
		);
		await go();
		expect(h.parseToolInput).not.toHaveBeenCalled();
		expect(mcp.callTool).toHaveBeenCalledWith('search_foods', { query: 'skyr' });
	});
});

describe('which calls wait for the user', () => {
	const FOOD = '6f1c1f0e-3b0a-4b8e-9d57-0c1d2e3f4a5b';
	const RECIPE = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
	const OLD_PHOTO = '/uploads/old.webp';
	const NEW_PHOTO = '/uploads/new.webp';
	const asked = (input: Record<string, unknown>) => ({
		preview: { summary: 'Please confirm', details: [] },
		input
	});
	const select = (table: string) =>
		queries.filter((query) => query.op === 'select' && query.table === table).length;
	const lookups = () => ({
		entries: select(T.entries),
		ingredients: select(T.ingredients),
		foods: select(T.foods),
		recipes: select(T.recipes)
	});
	const none = { entries: 0, ingredients: 0, foods: 0, recipes: 0 };

	type Setup = {
		entries?: boolean;
		inRecipe?: boolean;
		foodPhoto?: string | null;
		recipePhoto?: string | null;
	};
	const arrange = (setup: Setup) => {
		state.hasEntries = setup.entries ?? false;
		state.inRecipe = setup.inRecipe ?? false;
		state.photos = { foods: setup.foodPhoto ?? null, recipes: setup.recipePhoto ?? null };
	};

	test.each([
		['a confirm tool', 'delete_entry', { entryId: 'e1' }, {}, 'confirm', {}],
		[
			'a food whose nutrition changes and that has entries',
			'update_food',
			{ foodId: FOOD, calories: 120 },
			{ entries: true },
			'confirm',
			{ entries: 1 }
		],
		[
			'a food whose nutrition changes and that is an ingredient of a logged recipe',
			'update_food',
			{ foodId: FOOD, calories: 120 },
			{ inRecipe: true },
			'confirm',
			{ entries: 1, ingredients: 1 }
		],
		[
			'a food whose nutrition changes but that nobody logged, directly or in a recipe',
			'update_food',
			{ foodId: FOOD, calories: 120 },
			{},
			'write',
			{ entries: 1, ingredients: 1 }
		],
		[
			'a food that is only renamed',
			'update_food',
			{ foodId: FOOD, name: 'Skyr' },
			{ entries: true, inRecipe: true },
			'write',
			{}
		],
		[
			'a nutrition change without a food id',
			'update_food',
			{ calories: 120 },
			{ entries: true, inRecipe: true },
			'write',
			{}
		],
		[
			'a write with the force flag',
			'update_food',
			{ foodId: FOOD, name: 'Skyr', force: true },
			{},
			'confirm',
			{}
		],
		[
			'a food whose photo is replaced',
			'update_food',
			{ foodId: FOOD, imageUrl: NEW_PHOTO },
			{ foodPhoto: OLD_PHOTO },
			'confirm',
			{ entries: 1, ingredients: 1, foods: 1 }
		],
		[
			'a food whose photo is cleared',
			'update_food',
			{ foodId: FOOD, imageUrl: null },
			{ foodPhoto: OLD_PHOTO },
			'confirm',
			{ entries: 1, ingredients: 1, foods: 1 }
		],
		[
			'a food whose photo stays the same',
			'update_food',
			{ foodId: FOOD, imageUrl: OLD_PHOTO },
			{ foodPhoto: OLD_PHOTO },
			'write',
			{ entries: 1, ingredients: 1, foods: 1 }
		],
		[
			'a food that gets its first photo',
			'update_food',
			{ foodId: FOOD, imageUrl: NEW_PHOTO },
			{ foodPhoto: null },
			'write',
			{ entries: 1, ingredients: 1, foods: 1 }
		],
		[
			'a logged food whose photo is set (no photo lookup needed)',
			'update_food',
			{ foodId: FOOD, imageUrl: NEW_PHOTO },
			{ entries: true, foodPhoto: null },
			'confirm',
			{ entries: 1 }
		],
		[
			'a recipe whose ingredients change',
			'update_recipe',
			{ recipeId: RECIPE, ingredients: [] },
			{},
			'confirm',
			{}
		],
		[
			'a recipe whose servings change and that has entries',
			'update_recipe',
			{ recipeId: RECIPE, totalServings: 4 },
			{ entries: true },
			'confirm',
			{ entries: 1 }
		],
		[
			'a recipe whose servings change but that nobody logged',
			'update_recipe',
			{ recipeId: RECIPE, cookedWeight: 800 },
			{},
			'write',
			{ entries: 1 }
		],
		[
			'a recipe that is only renamed',
			'update_recipe',
			{ recipeId: RECIPE, name: 'Soup' },
			{ entries: true },
			'write',
			{}
		],
		[
			'a recipe whose photo is replaced',
			'update_recipe',
			{ recipeId: RECIPE, imageUrl: NEW_PHOTO },
			{ recipePhoto: OLD_PHOTO },
			'confirm',
			{ recipes: 1 }
		],
		[
			'a recipe whose photo is cleared',
			'update_recipe',
			{ recipeId: RECIPE, imageUrl: null },
			{ recipePhoto: OLD_PHOTO },
			'confirm',
			{ recipes: 1 }
		],
		[
			'a recipe whose photo stays the same',
			'update_recipe',
			{ recipeId: RECIPE, imageUrl: OLD_PHOTO },
			{ recipePhoto: OLD_PHOTO },
			'write',
			{ recipes: 1 }
		],
		[
			'a recipe that gets its first photo',
			'update_recipe',
			{ recipeId: RECIPE, imageUrl: NEW_PHOTO },
			{ recipePhoto: null },
			'write',
			{ recipes: 1 }
		],
		[
			'a logged recipe whose servings and photo change (no photo lookup needed)',
			'update_recipe',
			{ recipeId: RECIPE, totalServings: 4, imageUrl: NEW_PHOTO },
			{ entries: true, recipePhoto: OLD_PHOTO },
			'confirm',
			{ entries: 1 }
		],
		[
			'an unlogged recipe whose servings change and photo is replaced',
			'update_recipe',
			{ recipeId: RECIPE, totalServings: 4, imageUrl: NEW_PHOTO },
			{ recipePhoto: OLD_PHOTO },
			'confirm',
			{ entries: 1, recipes: 1 }
		],
		[
			'a supplement whose ingredients change',
			'update_supplement',
			{ supplementId: 's1', ingredients: [{ food: { name: 'Zinc' } }] },
			{},
			'confirm',
			{}
		],
		['a supplement dose', 'update_supplement', { supplementId: 's1', dose: 2 }, {}, 'write', {}],
		[
			'a plain write',
			'log_food',
			{ foodId: 'f1', servings: 1, mealType: 'Lunch' },
			{ entries: true },
			'write',
			{}
		],
		['a read', 'search_foods', { query: 'x' }, { entries: true }, 'read', {}]
	] as const)('treats %s as %s', async (_name, tool, input, setup, kind, expectedLookups) => {
		arrange(setup as Setup);
		h.buildActionPreview.mockResolvedValue(asked({ ...input, normalised: true }));
		script(message([toolUse(tool, { ...input }, 'toolu_1')], 'tool_use'), message([text('Done')]));
		await go();

		expect(insertsOf(T.toolCalls)[0]).toMatchObject({ toolName: tool, kind });
		expect(lookups()).toEqual({ ...none, ...expectedLookups });
		if (kind === 'confirm') {
			expect(h.buildActionPreview).toHaveBeenCalledWith(tool, input, expect.anything());
			expect(updatesOf(T.toolCalls)[0]).toMatchObject({ input: { ...input, normalised: true } });
			expect(updatesOf(T.toolCalls)).toEqual([expect.anything(), { actionStatus: 'pending' }]);
			expect(appended().filter((event) => event.type === 'action_required')).toHaveLength(1);
			expect(mcp.callTool).not.toHaveBeenCalled();
			expect(h.finalizeRun).not.toHaveBeenCalled();
		} else {
			expect(h.buildActionPreview).not.toHaveBeenCalled();
			expect(mcp.callTool).toHaveBeenCalledWith(tool, input);
			expect(finalized()).toEqual([completed]);
		}
	});

	test.each([
		['a day note that is cleared', { notes: null }, { notes: 'Ran 5 km' }, [], 'confirm'],
		['emptied water', { waterMl: null }, { waterMl: 1500 }, [], 'confirm'],
		['an emptied activity note', { activityNote: '' }, { activityNote: 'Yoga' }, [], 'confirm'],
		['a cleared field that holds nothing', { notes: null }, { notes: null }, [], 'write'],
		['a cleared field of a day without details', { activityCalories: null }, null, [], 'write'],
		['a fasting flag switched off', { isFastingDay: false }, { isFastingDay: true }, [], 'write'],
		['a changed note', { notes: 'New' }, { notes: 'Old' }, [], 'write']
	] as const)(
		'treats %s (%j over stored %j, %j) as %s',
		async (_name, change, stored, _labels, kind) => {
			h.loadDayDetails.mockResolvedValue(stored);
			h.buildActionPreview.mockResolvedValue(asked({ date: '2026-11-18', ...change }));
			script(
				message(
					[toolUse('set_day_properties', { date: '2026-11-18', ...change }, 'toolu_1')],
					'tool_use'
				),
				message([text('Done')])
			);
			await go();
			expect(insertsOf(T.toolCalls)[0]).toMatchObject({ kind });
			if (Object.values(change).some((value) => value === null || value === '')) {
				expect(h.loadDayDetails).toHaveBeenCalledWith('user-1', '2026-11-18');
			} else {
				expect(h.loadDayDetails).not.toHaveBeenCalled();
			}
		}
	);

	test.each([
		['set_food_labels', 'foodId', 'foods', [], ['banana'], 'confirm'],
		['set_recipe_labels', 'recipeId', 'recipes', [], ['soup'], 'confirm'],
		['set_food_labels', 'foodId', 'foods', [], [], 'write'],
		['set_food_labels', 'foodId', 'foods', ['fruit'], ['banana'], 'write']
	] as const)(
		'treats %s (%s in %s) setting %j over stored %j as %s',
		async (tool, key, table, labels, stored, kind) => {
			h.loadAssistantLabels.mockResolvedValue([...stored]);
			h.buildActionPreview.mockResolvedValue(asked({ [key]: FOOD, labels }));
			script(
				message([toolUse(tool, { [key]: FOOD, labels: [...labels] }, 'toolu_1')], 'tool_use'),
				message([text('Done')])
			);
			await go();
			expect(insertsOf(T.toolCalls)[0]).toMatchObject({ kind });
			if (labels.length === 0)
				expect(h.loadAssistantLabels).toHaveBeenCalledWith('user-1', table, FOOD);
			else expect(h.loadAssistantLabels).not.toHaveBeenCalled();
		}
	);

	test('lets a photo change through when the food or recipe row cannot be found', async () => {
		state.photos = { foods: undefined, recipes: undefined };
		script(
			message(
				[
					toolUse('update_food', { foodId: FOOD, imageUrl: NEW_PHOTO }, 'toolu_1'),
					toolUse('update_recipe', { recipeId: RECIPE, imageUrl: NEW_PHOTO }, 'toolu_2')
				],
				'tool_use'
			),
			message([text('Done')])
		);
		await go();
		expect(insertsOf(T.toolCalls).map((values) => values.kind)).toEqual(['write', 'write']);
		expect(lookups()).toEqual({ entries: 1, ingredients: 1, foods: 1, recipes: 1 });
		expect(h.buildActionPreview).not.toHaveBeenCalled();
	});

	test('finds a food in a logged recipe through the entries of that recipe', async () => {
		state.inRecipe = true;
		h.buildActionPreview.mockResolvedValue(asked({ foodId: FOOD }));
		script(message([toolUse('update_food', { foodId: FOOD, protein: 30 }, 'toolu_1')], 'tool_use'));
		await go();
		const [lookup] = writes('select', T.ingredients);
		expect(lookup!.joined).toEqual([T.entries]);
		expect(Object.keys(lookup!.fields!)).toEqual(['id']);
		expect(insertsOf(T.toolCalls)[0]).toMatchObject({ kind: 'confirm' });
	});

	test.each([
		['a short id', 'f1'],
		['an id with a trailing character', `${FOOD}0`],
		['a number', 42],
		['an object', { id: FOOD }],
		['a missing id', undefined]
	])('never queries for %s', async (_name, id) => {
		arrange({ entries: true, inRecipe: true, foodPhoto: OLD_PHOTO, recipePhoto: OLD_PHOTO });
		script(
			message(
				[
					toolUse('update_food', { foodId: id, calories: 120, imageUrl: NEW_PHOTO }, 'toolu_1'),
					toolUse('update_recipe', { recipeId: id, totalServings: 4, imageUrl: null }, 'toolu_2')
				],
				'tool_use'
			),
			message([text('Done')])
		);
		await go();
		expect(insertsOf(T.toolCalls).map((values) => values.kind)).toEqual(['write', 'write']);
		expect(lookups()).toEqual(none);
		expect(h.buildActionPreview).not.toHaveBeenCalled();
		expect(mcp.callTool).toHaveBeenCalledTimes(2);
	});

	test('accepts an upper-case id', async () => {
		arrange({ foodPhoto: OLD_PHOTO });
		h.buildActionPreview.mockResolvedValue(asked({ foodId: FOOD }));
		script(
			message(
				[toolUse('update_food', { foodId: FOOD.toUpperCase(), imageUrl: null }, 'toolu_1')],
				'tool_use'
			)
		);
		await go();
		expect(lookups()).toEqual({ ...none, entries: 1, ingredients: 1, foods: 1 });
		expect(insertsOf(T.toolCalls)[0]).toMatchObject({ kind: 'confirm' });
	});

	describe('after too many writes in one run', () => {
		const logFood = (id: string) =>
			toolUse('log_food', { foodId: 'f1', servings: 1, mealType: 'Lunch' }, id);

		test('lets writes run below the cap and asks for the one that reaches it', async () => {
			state.writeCount = String(MAX_UNCONFIRMED_WRITES_PER_RUN - 1);
			h.buildActionPreview.mockResolvedValue(asked({ foodId: 'f1' }));
			script(message([logFood('toolu_1'), logFood('toolu_2')], 'tool_use'));
			await go();
			expect(insertsOf(T.toolCalls).map((values) => [values.toolUseId, values.kind])).toEqual([
				['toolu_1', 'write'],
				['toolu_2', 'confirm']
			]);
			expect(mcp.callTool).toHaveBeenCalledTimes(1);
			expect(h.buildActionPreview).toHaveBeenCalledTimes(1);
			expect(h.buildActionPreview.mock.calls[0]![0]).toBe('log_food');
			expect(appended().filter((event) => event.type === 'action_required')).toHaveLength(1);
			expect(h.finalizeRun).not.toHaveBeenCalled();
			expect(persisted().map((turn) => turn.role)).toEqual(['assistant']);
		});

		test('asks for every write once the run is at the cap', async () => {
			state.writeCount = MAX_UNCONFIRMED_WRITES_PER_RUN;
			h.buildActionPreview.mockResolvedValue(asked({ foodId: 'f1' }));
			script(message([logFood('toolu_1'), logFood('toolu_2')], 'tool_use'));
			await go();
			expect(insertsOf(T.toolCalls).map((values) => values.kind)).toEqual(['confirm']);
			expect(mcp.callTool).not.toHaveBeenCalled();
			expect(h.buildActionPreview).toHaveBeenCalledTimes(1);
		});

		test('does not hold back reads at the cap', async () => {
			state.writeCount = MAX_UNCONFIRMED_WRITES_PER_RUN;
			script(
				message([toolUse('search_foods', { query: 'x' }, 'toolu_1')], 'tool_use'),
				message([text('Done')])
			);
			await go();
			expect(insertsOf(T.toolCalls)[0]).toMatchObject({ kind: 'read' });
			expect(mcp.callTool).toHaveBeenCalledWith('search_foods', { query: 'x' });
			expect(h.buildActionPreview).not.toHaveBeenCalled();
		});

		test('counts nothing for a run without ledger rows', async () => {
			state.writeCount = null;
			script(message([logFood('toolu_1')], 'tool_use'), message([text('Done')]));
			await go();
			expect(insertsOf(T.toolCalls)[0]).toMatchObject({ kind: 'write' });
			expect(mcp.callTool).toHaveBeenCalledTimes(1);
		});

		test('keeps a confirm tool a confirm tool at the cap', async () => {
			state.writeCount = MAX_UNCONFIRMED_WRITES_PER_RUN;
			h.buildActionPreview.mockResolvedValue(asked({ entryId: 'e1' }));
			script(message([toolUse('delete_entry', { entryId: 'e1' }, 'toolu_1')], 'tool_use'));
			await go();
			expect(insertsOf(T.toolCalls)[0]).toMatchObject({ kind: 'confirm' });
		});
	});
});

describe('server tools in a response', () => {
	test('shows only web search and fetch, not the code execution behind them', async () => {
		script(async (options) => {
			options.stream.onBlock(serverSearch('srv_1', 'code_execution'));
			options.stream.onBlock({
				type: 'code_execution_tool_result',
				tool_use_id: 'srv_1',
				content: { type: 'code_execution_result' }
			});
			options.stream.onBlock(serverSearch('srv_2', 'bash_code_execution'));
			options.stream.onBlock({ type: 'web_search_tool_result', content: [] });
			options.stream.onBlock({ type: 'web_fetch_tool_result', content: null });
			return message([text('Done')]);
		});
		await go();
		expect(appended()).toEqual([]);
		expect(finalized()).toEqual([completed]);
	});

	test('persists the whole turn, hidden tool blocks included', async () => {
		const turn = [
			serverSearch('srv_1', 'code_execution'),
			{
				type: 'code_execution_tool_result',
				tool_use_id: 'srv_1',
				content: { type: 'code_execution_result' }
			},
			text('Done')
		];
		script(message(turn));
		await go();
		expect(persisted()).toEqual([{ role: 'assistant', content: turn }]);
		expect(appended().map((event) => event.type)).toEqual(['text_delta']);
	});
});

describe('model call retries', () => {
	test('waits, checks the lease and the gates again, and tries once more', async () => {
		script(transient(), message([text('Back again')]));
		await go();
		expect(sleep).toHaveBeenCalledTimes(1);
		expect(sleep).toHaveBeenCalledWith(RETRY_DELAYS_MS[0], expect.any(AbortSignal));
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(h.hydrate).toHaveBeenCalledTimes(2);
		expect(h.assertClaudeGates).toHaveBeenCalledTimes(2);
		expect(sleep.mock.invocationCallOrder[0]).toBeLessThan(
			h.assertClaudeGates.mock.invocationCallOrder[1]!
		);
		expect(h.captureException).not.toHaveBeenCalled();
		expect(textDeltas().map((event) => event.text)).toEqual(['Back again']);
		expect(
			updatesOf(T.runs)
				.filter((set) => 'iterations' in set)
				.map((set) => set.iterations)
		).toEqual([1]);
		expect(finalized()).toEqual([completed]);
	});

	test('gives up after the last delay', async () => {
		script(transient(), transient(), transient());
		await go();
		expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(RETRY_DELAYS_MS);
		expect(h.callClaude).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
		expect(finalized()).toEqual([failedWith('api_error')]);
	});

	test.each([
		['text', (options: CallOptions) => options.stream.onText('Half an answer')],
		['a web search block', (options: CallOptions) => options.stream.onBlock(serverSearch('srv_1'))]
	])('never retries once %s streamed', async (_name, stream) => {
		script(async (options) => {
			stream(options);
			throw transient();
		});
		await go();
		expect(sleep).not.toHaveBeenCalled();
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(finalized()).toEqual([failedWith('api_error')]);
	});

	test.each([
		['rate_limited', 429, false, true],
		['rate_limited', 429, true, true],
		['server', 503, false, true],
		['server', 503, true, true],
		['connection', undefined, false, true],
		['connection', undefined, true, false],
		['timeout', undefined, false, false],
		['timeout', undefined, true, false],
		['other', undefined, false, false],
		['auth', 401, false, false],
		['invalid_request', 422, false, false]
	] as const)(
		'%s error, status %s, bytes received %s: retried %s',
		async (kind, status, bytes, retried) => {
			script(
				async (options) => {
					if (bytes) options.stream.onActivity();
					throw new ClaudeApiError({ kind, status, retryable: true });
				},
				message([text('Back again')])
			);
			await go();
			expect(h.callClaude).toHaveBeenCalledTimes(retried ? 2 : 1);
			expect(sleep).toHaveBeenCalledTimes(retried ? 1 : 0);
			expect(finalized()).toEqual([retried ? completed : failedWith('api_error')]);
		}
	);

	test('counts the bytes of every try on its own', async () => {
		script(
			async (options) => {
				options.stream.onActivity();
				throw transient();
			},
			new ClaudeApiError({ kind: 'connection', retryable: true }),
			message([text('Third time')])
		);
		await go();
		expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(RETRY_DELAYS_MS);
		expect(h.callClaude).toHaveBeenCalledTimes(3);
		expect(finalized()).toEqual([completed]);
	});

	test('never retries an error that is not a Claude API error', async () => {
		script(new Error('boom'), message([text('Never asked')]));
		await go();
		expect(sleep).not.toHaveBeenCalled();
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(finalized()).toEqual([failedWith('internal_error')]);
	});

	test('treats an abort while waiting like any other abort', async () => {
		stop = 'cancel';
		sleep.mockRejectedValue(new ClaudeAbortedError());
		script(transient());
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(finalized()).toEqual([
			{ status: 'cancelled', reason: 'user_cancelled', instanceId: 'inst-1' }
		]);
	});

	test('walks away when the lease was lost while waiting', async () => {
		state.leaseSeq = [true, true, false];
		script(transient(), message([text('Never asked')]));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(h.assertClaudeGates).toHaveBeenCalledTimes(1);
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('fails when a gate closed while waiting', async () => {
		script(transient(), message([text('Never asked')]));
		sleep.mockImplementation(async () => {
			h.assertClaudeGates.mockRejectedValue(new ClaudeGateError('user_budget_exhausted'));
		});
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(finalized()).toEqual([failedWith('user_budget_exhausted')]);
	});

	test('sleeps on the clock with the default sleeper', async () => {
		script(transient(), message([text('Back again')]));
		const running = go({ sleep: undefined });
		await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]! - 1);
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		await running;
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(sleep).not.toHaveBeenCalled();
		expect(finalized()).toEqual([completed]);
	});
});

describe('abortableSleep', () => {
	test('resolves after the delay and removes its abort listener', async () => {
		const abort = new AbortController();
		const remove = vi.spyOn(abort.signal, 'removeEventListener');
		const done = vi.fn();
		void abortableSleep(1000, abort.signal).then(done);
		await vi.advanceTimersByTimeAsync(999);
		expect(done).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(done).toHaveBeenCalledTimes(1);
		expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
	});

	test('rejects at once when the signal fired already', async () => {
		const abort = new AbortController();
		abort.abort();
		await expect(abortableSleep(1000, abort.signal)).rejects.toBeInstanceOf(ClaudeAbortedError);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('rejects and stops the timer when the signal fires while waiting', async () => {
		const abort = new AbortController();
		const outcome = expect(abortableSleep(1000, abort.signal)).rejects.toBeInstanceOf(
			ClaudeAbortedError
		);
		expect(vi.getTimerCount()).toBe(1);
		abort.abort();
		await outcome;
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('dropping web fetch', () => {
	const withFetch = () => h.ensurePromptSnapshot.mockResolvedValue(fetchSnapshot('snap-f'));
	const toolsOf = (index: number) =>
		JSON.stringify(h.callClaude.mock.calls[index]![0].params.tools);
	const hydratedFrom = () => h.hydrate.mock.calls.map((call) => call[3]);
	const authFailure = (status: number) =>
		new ClaudeApiError({ kind: 'auth', status, retryable: false });
	const probes = {
		fetch: rejection,
		tooLong,
		plain: () => badRequest(),
		wrongStatus: () =>
			new ClaudeApiError({
				kind: 'invalid_request',
				status: 422,
				retryable: false,
				topic: 'web_fetch'
			}),
		wrongKind: () =>
			new ClaudeApiError({ kind: 'server', status: 400, retryable: false, topic: 'web_fetch' }),
		tooLongOtherStatus: () =>
			new ClaudeApiError({
				kind: 'invalid_request',
				status: 422,
				retryable: false,
				topic: 'prompt_too_long'
			}),
		unrelated: () => new Error('boom')
	};
	const verdicts = (options: CallOptions) =>
		Object.fromEntries(
			Object.entries(probes).map(([name, make]) => [name, options.expectedRejection(make())])
		);
	const expected = (overrides: Partial<Record<keyof typeof probes, boolean>> = {}) => ({
		fetch: false,
		tooLong: true,
		plain: false,
		wrongStatus: false,
		wrongKind: false,
		tooLongOtherStatus: false,
		unrelated: false,
		...overrides
	});

	test('drops it once the call without it works and carries on with a new prompt', async () => {
		withFetch();
		script(rejection(), message([text('Hi')]));
		await go();

		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(toolsOf(0)).toContain('web_fetch');
		expect(toolsOf(1)).not.toContain('web_fetch');
		expect(h.ensurePromptSnapshot.mock.calls).toEqual([
			[conversation, 'claude-opus-5-5', { transcriptLength: 1 }]
		]);
		expect(hydratedFrom()).toEqual([0, 1]);

		expect(h.storePromptSnapshot).toHaveBeenCalledTimes(1);
		const [conversationId, model, stored, from] = h.storePromptSnapshot.mock.calls[0]!;
		expect([conversationId, model, from]).toEqual(['conv-1', 'claude-opus-5-5', 1]);
		expect(stored).toEqual({
			id: expect.stringMatching(/^[0-9a-f]{64}$/),
			system: snapshot.system,
			tools: [{ name: 'search_foods' }],
			fromPosition: 1
		});
		expect(h.storePromptSnapshot.mock.invocationCallOrder[0]).toBeGreaterThan(
			h.callClaude.mock.invocationCallOrder[1]!
		);

		expect(isWebFetchRejected()).toBe(true);
		expect(isWebFetchAccepted()).toBe(false);
		expect(h.captureMessage).toHaveBeenCalledTimes(1);
		expect(h.captureMessage).toHaveBeenCalledWith(expect.stringContaining('web fetch'), {
			level: 'warning',
			tags: { job: 'chat-run' },
			extra: { model: 'claude-opus-5-5' }
		});
		expect(sleep).not.toHaveBeenCalled();
		expect(h.captureException).not.toHaveBeenCalled();
		expect(finalized()).toEqual([completed]);
	});

	test('replays the prompt without web fetch from the end of the transcript', async () => {
		withFetch();
		h.loadRaw.mockImplementation(async () => [
			structuredClone(userTurn),
			{ role: 'assistant', content: [text('Earlier')] },
			structuredClone(userTurn)
		]);
		script(rejection(), message([text('Hi')]));
		await go();
		expect(h.ensurePromptSnapshot).toHaveBeenCalledWith(conversation, 'claude-opus-5-5', {
			transcriptLength: 3
		});
		expect(hydratedFrom()).toEqual([0, 3]);
		expect(h.storePromptSnapshot).toHaveBeenCalledWith(
			'conv-1',
			'claude-opus-5-5',
			expect.objectContaining({ fromPosition: 3 }),
			3
		);
		expect(finalized()).toEqual([completed]);
	});

	test('keeps the prompt without web fetch for the rest of the run', async () => {
		withFetch();
		script(
			rejection(),
			message([toolUse('list_meal_types', {}, 'toolu_1')], 'tool_use'),
			message([text('Done')])
		);
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(3);
		expect([1, 2].map((index) => toolsOf(index).includes('web_fetch'))).toEqual([false, false]);
		expect(hydratedFrom()).toEqual([0, 1, 1]);
		expect(h.storePromptSnapshot).toHaveBeenCalledTimes(1);
		expect(h.captureMessage).toHaveBeenCalledTimes(1);
		expect(finalized()).toEqual([completed]);
	});

	test('keeps every retry after dropping it and stores once the call went through', async () => {
		withFetch();
		script(rejection(), transient(), transient(), message([text('Hi')]));
		await go();
		expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(RETRY_DELAYS_MS);
		expect(h.callClaude).toHaveBeenCalledTimes(4);
		expect([1, 2, 3].some((index) => toolsOf(index).includes('web_fetch'))).toBe(false);
		expect(h.storePromptSnapshot).toHaveBeenCalledTimes(1);
		expect(h.storePromptSnapshot.mock.invocationCallOrder[0]).toBeGreaterThan(
			h.callClaude.mock.invocationCallOrder[3]!
		);
		expect(finalized()).toEqual([completed]);
	});

	test('reports the rejection once per process but stores it for every conversation', async () => {
		withFetch();
		script(rejection(), message([text('One')]));
		await go();
		script(rejection(), message([text('Two')]));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(4);
		expect(h.storePromptSnapshot).toHaveBeenCalledTimes(2);
		expect(h.captureMessage).toHaveBeenCalledTimes(1);
		expect(isWebFetchRejected()).toBe(true);
		expect(finalized()).toEqual([completed, completed]);
	});

	test('does not report a rejection the task loop already dropped, but still stores the prompt', async () => {
		rejectWebFetch();
		withFetch();
		script(rejection(), message([text('Hi')]));
		await go();
		expect(h.captureMessage).not.toHaveBeenCalled();
		expect(h.storePromptSnapshot).toHaveBeenCalledTimes(1);
		expect(finalized()).toEqual([completed]);
	});

	test('treats any 400 as a rejection once web fetch is known to be dropped', async () => {
		rejectWebFetch();
		withFetch();
		script(badRequest(), message([text('Hi')]));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(toolsOf(1)).not.toContain('web_fetch');
		expect(h.storePromptSnapshot).toHaveBeenCalledTimes(1);
		expect(h.captureMessage).not.toHaveBeenCalled();
		expect(finalized()).toEqual([completed]);
	});

	test('lets the call without web fetch decide when the 400 was about something else', async () => {
		rejectWebFetch();
		withFetch();
		script(badRequest(), badRequest());
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(h.storePromptSnapshot).not.toHaveBeenCalled();
		expect(h.captureMessage).not.toHaveBeenCalled();
		expect(finalized()).toEqual([failedWith('api_error')]);
	});

	test('does not take a 400 without a topic for a rejection while web fetch is not known to fail', async () => {
		withFetch();
		script(badRequest(), message([text('Never asked')]));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(h.storePromptSnapshot).not.toHaveBeenCalled();
		expect(isWebFetchRejected()).toBe(false);
		expect(finalized()).toEqual([failedWith('api_error')]);
	});

	test.each([
		['not known to fail', false],
		['known to fail', true]
	])(
		'never takes a prompt that is too long for a rejection while web fetch is %s',
		async (_name, known) => {
			if (known) rejectWebFetch();
			withFetch();
			script(tooLong(), message([text('Never asked')]));
			await go();
			expect(h.callClaude).toHaveBeenCalledTimes(1);
			expect(sleep).not.toHaveBeenCalled();
			expect(h.storePromptSnapshot).not.toHaveBeenCalled();
			expect(h.captureMessage).not.toHaveBeenCalled();
			expect(isWebFetchRejected()).toBe(known);
			expect(finalized()).toEqual([failedWith('conversation_too_long')]);
		}
	);

	test.each([
		['a plain error', () => [authFailure(401)], 'api_error'],
		['another rejection', () => [rejection()], 'api_error'],
		['a prompt that is too long', () => [tooLong()], 'conversation_too_long'],
		[
			'rate limits until the retries run out',
			() => [transient(), transient(), transient()],
			'api_error'
		]
	])(
		'stores and rejects nothing when the call without web fetch fails with %s',
		async (_name, failures, reason) => {
			withFetch();
			script(rejection(), ...failures());
			await go();
			expect(h.callClaude.mock.calls.length).toBeGreaterThanOrEqual(2);
			for (const index of h.callClaude.mock.calls.keys()) {
				if (index > 0) expect(toolsOf(index)).not.toContain('web_fetch');
			}
			expect(h.storePromptSnapshot).not.toHaveBeenCalled();
			expect(h.captureMessage).not.toHaveBeenCalled();
			expect(isWebFetchRejected()).toBe(false);
			expect(isWebFetchAccepted()).toBe(false);
			expect(finalized()).toEqual([failedWith(reason)]);
		}
	);

	test('remembers that web fetch works after the first successful call', async () => {
		withFetch();
		const seen: Array<Record<string, boolean>> = [];
		script(message([toolUse('list_meal_types', {}, 'toolu_1')], 'tool_use'), async (options) => {
			seen.push(verdicts(options));
			return message([text('Done')]);
		});
		await go();
		expect(isWebFetchAccepted()).toBe(true);
		expect(seen).toEqual([expected()]);
	});

	test('fails with api_error when a rejection comes after web fetch worked', async () => {
		withFetch();
		script(message([toolUse('list_meal_types', {}, 'toolu_1')], 'tool_use'), rejection());
		await go();
		expect(finalized()).toEqual([failedWith('api_error')]);
		expect(isWebFetchRejected()).toBe(false);
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(h.ensurePromptSnapshot).toHaveBeenCalledTimes(1);
		expect(h.storePromptSnapshot).not.toHaveBeenCalled();
	});

	test.each([
		['text', (options: CallOptions) => options.stream.onText('Half an answer')],
		['a web search block', (options: CallOptions) => options.stream.onBlock(serverSearch('srv_1'))]
	])('does not drop web fetch after %s streamed', async (_name, stream) => {
		withFetch();
		script(async (options) => {
			stream(options);
			throw rejection();
		});
		await go();
		expect(finalized()).toEqual([failedWith('api_error')]);
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(isWebFetchRejected()).toBe(false);
		expect(h.captureMessage).not.toHaveBeenCalled();
		expect(h.ensurePromptSnapshot).toHaveBeenCalledTimes(1);
		expect(h.storePromptSnapshot).not.toHaveBeenCalled();
	});

	test('treats a rejection as a plain error for a prompt without web fetch', async () => {
		const seen: Array<Record<string, boolean>> = [];
		script(async (options) => {
			seen.push(verdicts(options));
			throw rejection();
		});
		await go();
		expect(seen).toEqual([expected()]);
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(h.storePromptSnapshot).not.toHaveBeenCalled();
		expect(finalized()).toEqual([failedWith('api_error')]);
		expect(isWebFetchRejected()).toBe(false);
		expect(isWebFetchAccepted()).toBe(false);
	});

	describe('which 400s the call expects', () => {
		const record =
			(seen: Array<Record<string, boolean>>, outcome: Step): Step =>
			async (options) => {
				seen.push(verdicts(options));
				if (outcome instanceof Error) throw outcome;
				return outcome as Anthropic.Message;
			};

		test('expects a web fetch rejection and a prompt that is too long, then only the latter', async () => {
			withFetch();
			const seen: Array<Record<string, boolean>> = [];
			script(
				record(seen, rejection()),
				record(seen, message([toolUse('list_meal_types', {}, 'toolu_1')], 'tool_use')),
				record(seen, message([text('Done')]))
			);
			await go();
			expect(seen).toEqual([expected({ fetch: true }), expected(), expected()]);
		});

		test('also any other 400 once web fetch is known to be dropped', async () => {
			rejectWebFetch();
			withFetch();
			const seen: Array<Record<string, boolean>> = [];
			script(record(seen, rejection()), record(seen, message([text('Done')])));
			await go();
			expect(seen).toEqual([expected({ fetch: true, plain: true }), expected()]);
		});
	});
});

describe('the context of a run', () => {
	test('replays thinking from the prompt position on and carries the container along', async () => {
		h.ensurePromptSnapshot.mockResolvedValue({ ...snapshot, fromPosition: 3 });
		script(
			withContainer(message([toolUse('list_meal_types', {}, 'toolu_1')], 'tool_use'), 'cont_1'),
			message([toolUse('list_meal_types', {}, 'toolu_2')], 'tool_use'),
			withContainer(message([toolUse('list_meal_types', {}, 'toolu_3')], 'tool_use'), 'cont_2'),
			message([text('Done')])
		);
		await go();
		const params = h.callClaude.mock.calls.map(([options]) => options.params);
		expect('container' in params[0]!).toBe(false);
		expect(params.slice(1).map((request) => request.container)).toEqual([
			'cont_1',
			'cont_1',
			'cont_2'
		]);
		expect(h.hydrate.mock.calls.map((call) => call[3])).toEqual([3, 3, 3, 3]);
	});
});

describe('the new stop reasons', () => {
	test('fails with conversation_too_long when the context window is exceeded', async () => {
		script(message([text('Partial answer')], 'model_context_window_exceeded'));
		await go();
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(finalized()).toEqual([failedWith('conversation_too_long')]);
	});

	test('fails with conversation_too_long when the API says the request is too large', async () => {
		script(new ClaudeApiError({ kind: 'invalid_request', status: 413, retryable: false }));
		await go();
		expect(sleep).not.toHaveBeenCalled();
		expect(h.captureException).not.toHaveBeenCalled();
		expect(finalized()).toEqual([failedWith('conversation_too_long')]);
	});

	test('fails with conversation_too_long when the API says the prompt is too long', async () => {
		script(tooLong(), message([text('Never asked')]));
		await go();
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
		expect(h.captureException).not.toHaveBeenCalled();
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(finalized()).toEqual([failedWith('conversation_too_long')]);
	});

	test.each([
		['a 400 without a topic', badRequest()],
		['a 400 about web fetch', badRequest('web_fetch')],
		[
			'a too-long topic on another status',
			new ClaudeApiError({
				kind: 'invalid_request',
				status: 422,
				retryable: false,
				topic: 'prompt_too_long'
			})
		]
	])('fails with api_error for %s', async (_name, failure) => {
		script(failure);
		await go();
		expect(sleep).not.toHaveBeenCalled();
		expect(finalized()).toEqual([failedWith('api_error')]);
	});

	test('walks away silently when the lease is lost while winding down', async () => {
		script(async (options) => {
			options.stream.onText('Half an answer');
			state.lease = false;
			throw new ClaudeApiError({ kind: 'connection', retryable: true });
		});
		await go();
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(h.captureException).not.toHaveBeenCalled();
		expect(sleep).not.toHaveBeenCalled();
		expect(mcp.close).toHaveBeenCalledTimes(1);
	});
});
