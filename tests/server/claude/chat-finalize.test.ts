import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { createMockDB } from '../../helpers/mock-db';
import type { ChatMessageRow, ChatRun, ChatToolCall } from '$lib/server/schema';
import type { ChatEvent } from '$lib/server/claude/chat/events';
import type { RawMessage } from '$lib/server/claude/chat/transcript';

const h = vi.hoisted(() => ({
	getChatCapabilitySafe: vi.fn(),
	appendEvents: vi.fn(),
	listRunEvents: vi.fn(),
	notifyConversation: vi.fn(),
	loadRaw: vi.fn(),
	appendRaw: vi.fn()
}));

const { db, queueResults, reset, getCalls } = createMockDB();

vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/claude/chat/capability', () => ({
	getChatCapabilitySafe: h.getChatCapabilitySafe
}));
vi.mock('$lib/server/claude/chat/events', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/events')>()),
	appendEvents: h.appendEvents,
	listRunEvents: h.listRunEvents,
	notifyConversation: h.notifyConversation
}));
vi.mock('$lib/server/claude/chat/transcript', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/transcript')>()),
	loadRaw: h.loadRaw,
	appendRaw: h.appendRaw
}));

const finalize = await import('$lib/server/claude/chat/finalize');
const { serializeMessage, serializeRun } = await import('$lib/server/claude/chat/store');
const { STALE_RUN_MS } = await import('$lib/server/claude/chat/constants');

const UID = 'user-1';
const CID = 'conv-1';
const RID = 'run-1';
const AID = 'asst-1';
const T = new Date('2026-11-18T10:00:00.000Z');
const CAPABILITY = { available: true, remainingBudgetUsd: 4.2 };
const UNKNOWN_OUTCOME =
	'Outcome unknown: the assistant stopped while this call ran. Check the data before retrying.';

const runRow = (overrides: Partial<ChatRun> = {}) =>
	({
		id: RID,
		conversationId: CID,
		userId: UID,
		userMessageId: 'msg-1',
		assistantMessageId: AID,
		status: 'running',
		reason: null,
		model: null,
		iterations: 1,
		changes: [],
		leaseOwner: 'inst-1',
		heartbeatAt: new Date(),
		createdAt: T,
		updatedAt: T,
		startedAt: T,
		finishedAt: null,
		...overrides
	}) as ChatRun;

const messageRow = (overrides: Partial<ChatMessageRow> = {}) =>
	({
		id: AID,
		conversationId: CID,
		userId: UID,
		runId: RID,
		role: 'assistant',
		status: 'completed',
		reason: null,
		parts: [],
		imageUrls: null,
		context: null,
		createdSeq: null,
		createdAt: T,
		updatedAt: T,
		...overrides
	}) as ChatMessageRow;

const callRow = (overrides: Partial<ChatToolCall> = {}) =>
	({
		id: 'call-1',
		conversationId: CID,
		userId: UID,
		runId: RID,
		messageId: AID,
		toolUseId: 'tu-1',
		toolName: 'log_food',
		kind: 'write',
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
		createdAt: T,
		finishedAt: null,
		...overrides
	}) as ChatToolCall;

const toolUse = (id: string) => ({ type: 'tool_use' as const, id, name: 'log_food', input: {} });

const danglingRaw = (...ids: string[]): RawMessage[] => [
	{ role: 'user', content: [{ type: 'text', text: 'Log it' }] },
	{ role: 'assistant', content: [{ type: 'text', text: 'On it' }, ...ids.map(toolUse)] }
];

type Script = {
	current?: ChatRun | null;
	conversation?: unknown[];
	locked?: ChatRun | null;
	pending?: ChatToolCall[];
	calls?: ChatToolCall[];
	message?: ChatMessageRow | null;
	updated?: ChatRun;
};

const script = (o: Script = {}) => {
	const current = o.current === undefined ? runRow() : o.current;
	const locked = o.locked === undefined ? current : o.locked;
	const withMessage = !!locked?.assistantMessageId;
	queueResults([
		current ? [current] : [],
		o.conversation ?? [{ id: CID }],
		locked ? [locked] : [],
		o.pending ?? [],
		...(o.calls ? [o.calls] : []),
		[],
		...(withMessage ? [o.message === null ? [] : [o.message ?? messageRow()]] : []),
		[
			o.updated ??
				runRow({ status: 'completed', leaseOwner: null, heartbeatAt: null, finishedAt: T })
		]
	]);
};

const setCalls = () =>
	getCalls()
		.filter((call) => call.method === 'set')
		.map((call) => call.args[0] as Record<string, unknown>);
const callsOf = (method: string) => getCalls().filter((call) => call.method === method);
const order = (fn: { mock: { invocationCallOrder: number[] } }, index = 0) =>
	fn.mock.invocationCallOrder[index]!;
const whereOf = (index: number) => {
	const { sql, params } = new PgDialect().sqlToQuery(callsOf('where')[index]!.args[0] as SQL);
	return { sql, params };
};
const expectCalledWithDb = (fn: { mock: { calls: unknown[][] } }, ...rest: unknown[]) => {
	const [first, ...others] = fn.mock.calls[0]!;
	expect(first === db).toBe(true);
	expect(others).toEqual(rest);
};
const emitted = (call: number) => h.appendEvents.mock.calls[call]![2] as ChatEvent[];

const COMPLETED = { status: 'completed', reason: null } as const;

const expectLeftAlone = (result: unknown) => {
	expect(result).toBeNull();
	expect(callsOf('update')).toHaveLength(0);
	expect(h.appendEvents).not.toHaveBeenCalled();
	expect(h.appendRaw).not.toHaveBeenCalled();
	expect(h.notifyConversation).not.toHaveBeenCalled();
};

beforeEach(() => {
	reset();
	for (const fn of Object.values(h)) fn.mockReset();
	h.getChatCapabilitySafe.mockResolvedValue(CAPABILITY);
	h.loadRaw.mockResolvedValue([]);
	h.listRunEvents.mockResolvedValue([]);
	h.appendEvents.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe('notExecutedText', () => {
	test('says the restart for an interrupted run whatever the reason', () => {
		const restart = 'Not executed: the server restarted before this call ran. Nothing was changed.';
		expect(finalize.notExecutedText({ status: 'interrupted', reason: 'server_restart' })).toBe(
			restart
		);
		expect(finalize.notExecutedText({ status: 'interrupted', reason: 'user_cancelled' })).toBe(
			restart
		);
		expect(finalize.notExecutedText({ status: 'interrupted', reason: null })).toBe(restart);
	});

	test('names the reason a run was cancelled', () => {
		expect(finalize.notExecutedText({ status: 'cancelled', reason: 'user_cancelled' })).toBe(
			'Not executed: the user stopped the assistant before this call ran. Nothing was changed.'
		);
		expect(finalize.notExecutedText({ status: 'cancelled', reason: 'superseded' })).toBe(
			'Not executed: the user sent a new message instead of confirming. Nothing was changed.'
		);
		expect(finalize.notExecutedText({ status: 'cancelled', reason: 'action_expired' })).toBe(
			'Not executed: the user did not confirm in time. Nothing was changed.'
		);
	});

	test('falls back to the reason, then the status', () => {
		expect(finalize.notExecutedText({ status: 'failed', reason: 'api_error' })).toBe(
			'Not executed: the assistant stopped (api_error) before this call ran. Nothing was changed.'
		);
		expect(finalize.notExecutedText({ status: 'completed', reason: 'output_limit' })).toBe(
			'Not executed: the assistant stopped (output_limit) before this call ran. Nothing was changed.'
		);
		expect(finalize.notExecutedText({ status: 'failed', reason: null })).toBe(
			'Not executed: the assistant stopped (failed) before this call ran. Nothing was changed.'
		);
		expect(finalize.notExecutedText({ status: 'cancelled', reason: null })).toBe(
			'Not executed: the assistant stopped (cancelled) before this call ran. Nothing was changed.'
		);
	});
});

describe('changesOfParts', () => {
	const tool = (changes: unknown[]) => ({
		type: 'tool' as const,
		toolUseId: 'tu',
		name: 'log_food',
		label: 'Logging food',
		status: 'ok' as const,
		summary: null,
		changed: [],
		changes: changes as never[]
	});

	test('is empty for parts without tool changes', () => {
		expect(finalize.changesOfParts([])).toEqual([]);
		expect(
			finalize.changesOfParts([
				{ type: 'text', text: 'hi' },
				{ type: 'image', url: '/uploads/a.webp' },
				tool([])
			])
		).toEqual([]);
	});

	test('merges the changes of all tool parts per domain in a fixed order', () => {
		const parts = [
			{ type: 'text' as const, text: 'Done' },
			tool([{ domain: 'weight' }]),
			tool([{ domain: 'entries', dates: ['2026-11-18'] }]),
			tool([
				{ domain: 'entries', dates: ['2026-11-17', '2026-11-18'] },
				{ domain: 'foods', ids: ['f-1'] }
			]),
			{
				type: 'action' as const,
				actionId: 'a',
				toolUseId: 'tu-a',
				name: 'delete_entry',
				label: 'Deleting',
				status: 'approved' as const,
				preview: { summary: '', details: [] },
				expiresAt: ''
			}
		];
		expect(finalize.changesOfParts(parts)).toEqual([
			{ domain: 'entries', dates: ['2026-11-17', '2026-11-18'] },
			{ domain: 'foods', ids: ['f-1'] },
			{ domain: 'weight' }
		]);
	});

	test('an unscoped change widens its domain', () => {
		const parts = [
			tool([{ domain: 'entries', dates: ['2026-11-18'] }]),
			tool([{ domain: 'entries' }])
		];
		expect(finalize.changesOfParts(parts)).toEqual([{ domain: 'entries' }]);
	});
});

describe('finalizeRun: when it does nothing', () => {
	test('returns null for a run that does not exist', async () => {
		script({ current: null });
		expectLeftAlone(await finalize.finalizeRun(RID, COMPLETED));
		expect(callsOf('transaction')).toHaveLength(0);
		expect(h.getChatCapabilitySafe).not.toHaveBeenCalled();
	});

	test.each(['completed', 'failed', 'cancelled', 'interrupted'])(
		'returns null for a %s run before opening a transaction',
		async (status) => {
			script({ current: runRow({ status }) });
			expectLeftAlone(await finalize.finalizeRun(RID, { status: 'failed', reason: 'api_error' }));
			expect(callsOf('transaction')).toHaveLength(0);
			expect(h.getChatCapabilitySafe).not.toHaveBeenCalled();
		}
	);

	test('reads the capability of the runs owner once the run is open', async () => {
		script({ current: runRow({ userId: 'owner-9' }) });
		await finalize.finalizeRun(RID, COMPLETED);
		expect(h.getChatCapabilitySafe).toHaveBeenCalledWith('owner-9');
	});

	test('returns null when the conversation is gone', async () => {
		script({ conversation: [] });
		expectLeftAlone(await finalize.finalizeRun(RID, COMPLETED));
		expect(callsOf('transaction')).toHaveLength(1);
		expect(callsOf('for').map((call) => call.args[0])).toEqual(['update']);
	});

	test('returns null when the run vanished inside the transaction', async () => {
		script({ locked: null });
		expectLeftAlone(await finalize.finalizeRun(RID, COMPLETED));
		expect(callsOf('for').map((call) => call.args[0])).toEqual(['update', 'update']);
	});

	test.each(['completed', 'failed', 'cancelled', 'interrupted'])(
		'returns null when the run turned %s before its lock was taken',
		async (status) => {
			script({ locked: runRow({ status }) });
			expectLeftAlone(
				await finalize.finalizeRun(RID, { status: 'cancelled', reason: 'user_cancelled' })
			);
		}
	);

	test('leaves a run alone whose status onlyIf excludes', async () => {
		script({ locked: runRow({ status: 'running' }) });
		expectLeftAlone(
			await finalize.finalizeRun(RID, {
				status: 'cancelled',
				reason: 'superseded',
				onlyIf: ['awaiting_confirmation']
			})
		);
	});

	test('finalizes a run whose status onlyIf includes', async () => {
		script({ locked: runRow({ status: 'awaiting_confirmation', leaseOwner: null }) });
		const result = await finalize.finalizeRun(RID, {
			status: 'cancelled',
			reason: 'superseded',
			onlyIf: ['awaiting_confirmation', 'queued']
		});
		expect(result).not.toBeNull();
	});

	test('leaves a running run another process owns alone', async () => {
		script({ locked: runRow({ status: 'running', leaseOwner: 'other-process' }) });
		expectLeftAlone(await finalize.finalizeRun(RID, { ...COMPLETED, instanceId: 'inst-1' }));
	});

	test.each([
		['a running run this process owns', { status: 'running', leaseOwner: 'inst-1' }],
		['a queued run nobody owns', { status: 'queued', leaseOwner: null }],
		['a paused run', { status: 'awaiting_confirmation', leaseOwner: 'other-process' }]
	])('finalizes %s for its instance', async (_name, overrides) => {
		script({ locked: runRow(overrides) });
		const result = await finalize.finalizeRun(RID, { ...COMPLETED, instanceId: 'inst-1' });
		expect(result).not.toBeNull();
	});

	test('ignores the lease without an instance id', async () => {
		script({ locked: runRow({ status: 'running', leaseOwner: 'other-process' }) });
		expect(await finalize.finalizeRun(RID, COMPLETED)).not.toBeNull();
	});

	test('leaves a running run with a fresh heartbeat alone when only stale ones count', async () => {
		script({ locked: runRow({ status: 'running', heartbeatAt: new Date() }) });
		expectLeftAlone(
			await finalize.finalizeRun(RID, {
				status: 'interrupted',
				reason: 'server_restart',
				requireStale: true
			})
		);
	});

	test('treats a heartbeat of exactly the stale limit as fresh', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));
		script({
			locked: runRow({
				status: 'running',
				heartbeatAt: new Date(Date.now() - STALE_RUN_MS)
			})
		});
		expectLeftAlone(
			await finalize.finalizeRun(RID, {
				status: 'interrupted',
				reason: 'server_restart',
				requireStale: true
			})
		);
	});

	test.each([
		['an old heartbeat', new Date(Date.now() - STALE_RUN_MS - 1000)],
		['no heartbeat', null]
	])('finalizes a running run with %s when only stale ones count', async (_name, heartbeatAt) => {
		script({ locked: runRow({ status: 'running', heartbeatAt }) });
		const result = await finalize.finalizeRun(RID, {
			status: 'interrupted',
			reason: 'server_restart',
			requireStale: true
		});
		expect(result).not.toBeNull();
	});

	test.each(['queued', 'awaiting_confirmation'])(
		'never treats a %s run as stale',
		async (status) => {
			script({ locked: runRow({ status, heartbeatAt: null, leaseOwner: null }) });
			expectLeftAlone(
				await finalize.finalizeRun(RID, {
					status: 'interrupted',
					reason: 'server_restart',
					requireStale: true
				})
			);
		}
	);
});

describe('finalizeRun: pending actions', () => {
	test('cancels pending confirmations of the run and announces them', async () => {
		script({
			pending: [
				callRow({ id: 'a-1', partIndex: 2, actionStatus: 'pending' }),
				callRow({ id: 'a-2', partIndex: 0, actionStatus: 'pending', toolUseId: 'tu-2' })
			]
		});

		await finalize.finalizeRun(RID, { status: 'cancelled', reason: 'user_cancelled' });

		const [pendingSet] = setCalls();
		expect(pendingSet).toMatchObject({ actionStatus: 'cancelled' });
		expect(pendingSet).toHaveProperty('decidedAt');
		const { sql, params } = whereOf(3);
		expect(sql).toContain('"chat_tool_calls"."run_id" =');
		expect(sql).toContain('"chat_tool_calls"."action_status" =');
		expect(params).toEqual([RID, 'pending']);
		expect(emitted(0)).toEqual([
			{
				type: 'action_resolved',
				runId: RID,
				messageId: AID,
				partIndex: 2,
				actionId: 'a-1',
				status: 'cancelled'
			},
			{
				type: 'action_resolved',
				runId: RID,
				messageId: AID,
				partIndex: 0,
				actionId: 'a-2',
				status: 'cancelled'
			}
		]);
	});

	test('marks them expired when asked to', async () => {
		script({ pending: [callRow({ id: 'a-1', partIndex: 1 })] });
		await finalize.finalizeRun(RID, {
			status: 'cancelled',
			reason: 'action_expired',
			actionStatus: 'expired',
			onlyIf: ['running']
		});
		expect(setCalls()[0]).toMatchObject({ actionStatus: 'expired' });
		expect(emitted(0)).toEqual([expect.objectContaining({ actionId: 'a-1', status: 'expired' })]);
	});

	test('skips actions without a part and runs without an assistant message', async () => {
		script({
			pending: [callRow({ id: 'a-1', partIndex: null }), callRow({ id: 'a-2', partIndex: 1 })]
		});
		await finalize.finalizeRun(RID, { status: 'cancelled', reason: 'user_cancelled' });
		expect(emitted(0).map((event) => ('actionId' in event ? event.actionId : null))).toEqual([
			'a-2'
		]);

		reset();
		h.appendEvents.mockClear();
		script({
			current: runRow({ assistantMessageId: null }),
			pending: [callRow({ id: 'a-3', partIndex: 1 })]
		});
		await finalize.finalizeRun(RID, { status: 'cancelled', reason: 'user_cancelled' });
		expect(setCalls()[0]).toMatchObject({ actionStatus: 'cancelled' });
		expect(emitted(0)).toEqual([]);
	});
});

describe('finalizeRun: tool calls the transcript owes a result', () => {
	test('writes nothing when the transcript ends on a user turn or is empty', async () => {
		script();
		await finalize.finalizeRun(RID, COMPLETED);
		expectCalledWithDb(h.loadRaw, CID);
		expect(h.appendRaw).not.toHaveBeenCalled();

		reset();
		h.loadRaw.mockResolvedValue([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
		script();
		await finalize.finalizeRun(RID, COMPLETED);
		expect(h.appendRaw).not.toHaveBeenCalled();
		expect(callsOf('select')).toHaveLength(3);
	});

	test('writes nothing for an assistant turn without tool calls', async () => {
		h.loadRaw.mockResolvedValue([{ role: 'assistant', content: [{ type: 'text', text: 'Done' }] }]);
		script();
		await finalize.finalizeRun(RID, COMPLETED);
		expect(h.appendRaw).not.toHaveBeenCalled();
	});

	test('answers every dangling call: stored result, unknown outcome, or not executed', async () => {
		h.loadRaw.mockResolvedValue(danglingRaw('tu-ok', 'tu-err', 'tu-started', 'tu-none', 'tu-null'));
		script({
			calls: [
				callRow({
					toolUseId: 'tu-ok',
					execution: 'succeeded',
					resultText: '150 g logged',
					isError: false
				}),
				callRow({
					toolUseId: 'tu-err',
					execution: 'failed',
					resultText: 'Food not found',
					isError: true
				}),
				callRow({ toolUseId: 'tu-started', execution: 'started' }),
				callRow({ toolUseId: 'tu-null', execution: null, resultText: null, isError: false })
			]
		});

		await finalize.finalizeRun(RID, { status: 'cancelled', reason: 'user_cancelled' });

		expect(h.appendRaw).toHaveBeenCalledTimes(1);
		expectCalledWithDb(h.appendRaw, CID, RID, [
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'tu-ok', content: '150 g logged' },
					{ type: 'tool_result', tool_use_id: 'tu-err', content: 'Food not found', is_error: true },
					{
						type: 'tool_result',
						tool_use_id: 'tu-started',
						content: UNKNOWN_OUTCOME,
						is_error: true
					},
					{
						type: 'tool_result',
						tool_use_id: 'tu-none',
						content:
							'Not executed: the user stopped the assistant before this call ran. Nothing was changed.',
						is_error: true
					},
					{
						type: 'tool_result',
						tool_use_id: 'tu-null',
						content:
							'Not executed: the user stopped the assistant before this call ran. Nothing was changed.',
						is_error: true
					}
				]
			}
		]);
		const { sql, params } = whereOf(4);
		expect(sql).toContain('"chat_tool_calls"."conversation_id" =');
		expect(sql).toContain('"chat_tool_calls"."tool_use_id" in');
		expect(params).toEqual([CID, 'tu-ok', 'tu-err', 'tu-started', 'tu-none', 'tu-null']);
	});

	test('a stored result wins over a started execution and keeps its error flag', async () => {
		h.loadRaw.mockResolvedValue(danglingRaw('tu-1'));
		script({
			calls: [
				callRow({ toolUseId: 'tu-1', execution: 'started', resultText: 'Logged', isError: false })
			]
		});
		await finalize.finalizeRun(RID, COMPLETED);
		expect(h.appendRaw.mock.calls[0]![3][0].content).toEqual([
			{ type: 'tool_result', tool_use_id: 'tu-1', content: 'Logged' }
		]);
	});

	test('uses the ending for calls that never ran', async () => {
		h.loadRaw.mockResolvedValue(danglingRaw('tu-1'));
		script({ calls: [] });
		await finalize.finalizeRun(RID, { status: 'interrupted', reason: 'server_restart' });
		expect(h.appendRaw.mock.calls[0]![3][0].content).toEqual([
			{
				type: 'tool_result',
				tool_use_id: 'tu-1',
				content: 'Not executed: the server restarted before this call ran. Nothing was changed.',
				is_error: true
			}
		]);

		reset();
		h.appendRaw.mockClear();
		script({ calls: [callRow({ toolUseId: 'tu-1', actionStatus: 'pending' })] });
		await finalize.finalizeRun(RID, {
			status: 'cancelled',
			reason: 'superseded',
			onlyIf: ['running']
		});
		expect(h.appendRaw.mock.calls[0]![3][0].content[0].content).toBe(
			'Not executed: the user sent a new message instead of confirming. Nothing was changed.'
		);
	});

	test('closes the transcript before the run ends', async () => {
		h.loadRaw.mockResolvedValue(danglingRaw('tu-1'));
		script({ calls: [] });
		await finalize.finalizeRun(RID, COMPLETED);
		expect(order(h.appendRaw)).toBeLessThan(order(h.appendEvents));
	});

	test('marks started executions as unknown outcome', async () => {
		script();
		await finalize.finalizeRun(RID, COMPLETED);
		const sets = setCalls();
		expect(sets[1]).toEqual({
			execution: 'unknown',
			resultText: UNKNOWN_OUTCOME,
			isError: true,
			finishedAt: expect.anything()
		});
		const { sql, params } = whereOf(4);
		expect(sql).toContain('"chat_tool_calls"."run_id" =');
		expect(sql).toContain('"chat_tool_calls"."execution" =');
		expect(params).toEqual([RID, 'started']);
	});
});

describe('finalizeRun: error events', () => {
	test.each(['completed', 'cancelled'] as const)('a %s run reports no error', async (status) => {
		script();
		await finalize.finalizeRun(RID, { status, reason: 'user_cancelled' });
		expect(emitted(0)).toEqual([]);
	});

	test('a failed run reports the error it was given', async () => {
		script();
		await finalize.finalizeRun(RID, {
			status: 'failed',
			reason: 'api_error',
			error: { code: 'overloaded', message: 'The API is busy' }
		});
		expect(emitted(0)).toEqual([
			{ type: 'error', runId: RID, code: 'overloaded', error: 'The API is busy' }
		]);
	});

	test.each([
		['not_configured', 'The assistant is not available right now.'],
		['disabled', 'The assistant is not available right now.'],
		['no_access', 'The assistant is not available for this account.'],
		['user_budget_exhausted', "This month's assistant budget is used up."],
		['global_budget_exhausted', "The assistant's budget for this month is used up."],
		['refusal', 'The assistant declined to answer this request.'],
		['api_error', 'The assistant service returned an error. Try again.'],
		['internal_error', 'The assistant stopped because of an internal error.']
	])('a failed run with reason %s reads the message from the table', async (reason, message) => {
		script();
		await finalize.finalizeRun(RID, { status: 'failed', reason });
		expect(emitted(0)).toEqual([{ type: 'error', runId: RID, code: reason, error: message }]);
	});

	test('the message of the error wins over the table', async () => {
		script();
		await finalize.finalizeRun(RID, {
			status: 'failed',
			reason: 'api_error',
			error: { code: 'api_error', message: 'Upstream said no' }
		});
		expect(emitted(0)).toEqual([
			{ type: 'error', runId: RID, code: 'api_error', error: 'Upstream said no' }
		]);
	});

	test('an unknown reason and a missing reason both fall back', async () => {
		script();
		await finalize.finalizeRun(RID, { status: 'failed', reason: 'something_odd' });
		expect(emitted(0)).toEqual([
			{ type: 'error', runId: RID, code: 'something_odd', error: 'The assistant stopped.' }
		]);

		reset();
		h.appendEvents.mockClear();
		script();
		await finalize.finalizeRun(RID, { status: 'failed', reason: null });
		expect(emitted(0)).toEqual([
			{ type: 'error', runId: RID, code: 'failed', error: 'The assistant stopped.' }
		]);
	});

	test('an interrupted run reports its reason as the error code', async () => {
		script();
		await finalize.finalizeRun(RID, { status: 'interrupted', reason: 'server_restart' });
		expect(emitted(0)).toEqual([
			{ type: 'error', runId: RID, code: 'server_restart', error: 'The assistant stopped.' }
		]);

		reset();
		h.appendEvents.mockClear();
		script();
		await finalize.finalizeRun(RID, { status: 'interrupted', reason: null });
		expect(emitted(0)).toEqual([expect.objectContaining({ type: 'error', code: 'interrupted' })]);
	});

	test('the error follows the resolved actions', async () => {
		script({ pending: [callRow({ id: 'a-1', partIndex: 0 })] });
		await finalize.finalizeRun(RID, {
			status: 'failed',
			reason: 'internal_error',
			actionStatus: 'cancelled'
		});
		expect(emitted(0).map((event) => event.type)).toEqual(['action_resolved', 'error']);
	});
});

describe('finalizeRun: ending the run', () => {
	const events: Array<ChatEvent & { seq: number; createdAt: string }> = [
		{
			type: 'tool_started',
			runId: RID,
			messageId: AID,
			partIndex: 0,
			toolUseId: 'tu-1',
			name: 'log_food',
			label: 'Logging food',
			seq: 2,
			createdAt: T.toISOString()
		},
		{
			type: 'tool_finished',
			runId: RID,
			messageId: AID,
			partIndex: 0,
			toolUseId: 'tu-1',
			name: 'log_food',
			status: 'ok',
			summary: 'Logged 150 g',
			changed: ['entries'],
			changes: [{ domain: 'entries', dates: ['2026-11-18'] }],
			seq: 3,
			createdAt: T.toISOString()
		},
		{
			type: 'text_delta',
			runId: RID,
			messageId: AID,
			partIndex: 1,
			text: 'Done.',
			seq: 4,
			createdAt: T.toISOString()
		}
	];
	const foldedParts = [
		{
			type: 'tool',
			toolUseId: 'tu-1',
			name: 'log_food',
			label: 'Logging food',
			status: 'ok',
			summary: 'Logged 150 g',
			changed: ['entries'],
			changes: [{ domain: 'entries', dates: ['2026-11-18'] }]
		},
		{ type: 'text', text: 'Done.' }
	];

	test('folds the events into the assistant message and stores the outcome on the run', async () => {
		h.listRunEvents.mockResolvedValue(events);
		const stored = messageRow({ status: 'completed', parts: foldedParts });
		const updated = runRow({
			status: 'completed',
			reason: null,
			changes: [{ domain: 'entries', dates: ['2026-11-18'] }],
			leaseOwner: null,
			heartbeatAt: null,
			finishedAt: T
		});
		script({ message: stored, updated });

		const result = await finalize.finalizeRun(RID, COMPLETED);

		expect(result).toBe(updated);
		expectCalledWithDb(h.listRunEvents, CID, RID);
		const sets = setCalls();
		expect(sets).toHaveLength(4);
		expect(sets[2]).toEqual({
			parts: foldedParts,
			status: 'completed',
			reason: null,
			updatedAt: expect.anything()
		});
		expect(sets[3]).toEqual({
			status: 'completed',
			reason: null,
			changes: [{ domain: 'entries', dates: ['2026-11-18'] }],
			leaseOwner: null,
			heartbeatAt: null,
			finishedAt: expect.anything(),
			updatedAt: expect.anything()
		});
		expect(whereOf(5).params).toEqual([AID]);
		expect(whereOf(6).params).toEqual([RID]);

		const view = serializeRun(updated);
		expect(h.appendEvents).toHaveBeenCalledTimes(2);
		expect(h.appendEvents.mock.calls[1]![0]).toBe(db);
		expect(h.appendEvents.mock.calls[1]![1]).toBe(CID);
		expect(emitted(1)).toEqual([
			{
				type: 'message_completed',
				runId: RID,
				messageId: AID,
				message: serializeMessage(stored)
			},
			{
				type: 'run_finished',
				runId: RID,
				messageId: AID,
				status: 'completed',
				reason: null,
				changed: ['entries'],
				changes: [{ domain: 'entries', dates: ['2026-11-18'] }],
				run: view,
				capability: CAPABILITY
			}
		]);
	});

	test.each([
		['completed', null],
		['failed', 'api_error'],
		['cancelled', 'user_cancelled'],
		['interrupted', 'server_restart']
	] as const)('stores a %s ending on both the message and the run', async (status, reason) => {
		script({
			message: messageRow({ status, reason }),
			updated: runRow({ status, reason, leaseOwner: null, heartbeatAt: null, finishedAt: T })
		});
		const result = await finalize.finalizeRun(RID, { status, reason });
		expect(result).toMatchObject({ status, reason });
		const sets = setCalls();
		expect(sets[2]).toMatchObject({ status, reason, parts: [] });
		expect(sets[3]).toMatchObject({
			status,
			reason,
			changes: [],
			leaseOwner: null,
			heartbeatAt: null
		});
		const finished = emitted(1).at(-1) as Extract<ChatEvent, { type: 'run_finished' }>;
		expect(finished).toMatchObject({ status, reason, changed: [], changes: [] });
		expect(emitted(1)[0]).toMatchObject({
			type: 'message_completed',
			message: { status, reason }
		});
	});

	test('emits only run_finished when the run never created an assistant message', async () => {
		script({
			current: runRow({ assistantMessageId: null }),
			updated: runRow({
				assistantMessageId: null,
				status: 'failed',
				reason: 'disabled',
				leaseOwner: null,
				heartbeatAt: null,
				finishedAt: T
			})
		});

		await finalize.finalizeRun(RID, { status: 'failed', reason: 'disabled' });

		expect(h.listRunEvents).not.toHaveBeenCalled();
		expect(setCalls()).toHaveLength(3);
		expect(emitted(0)).toEqual([
			{
				type: 'error',
				runId: RID,
				code: 'disabled',
				error: 'The assistant is not available right now.'
			}
		]);
		expect(emitted(1)).toEqual([
			expect.objectContaining({
				type: 'run_finished',
				runId: RID,
				messageId: null,
				status: 'failed',
				reason: 'disabled',
				capability: CAPABILITY
			})
		]);
	});

	test('omits message_completed when the assistant message was deleted meanwhile', async () => {
		script({ message: null });
		await finalize.finalizeRun(RID, COMPLETED);
		expect(emitted(1).map((event) => event.type)).toEqual(['run_finished']);
		expect(emitted(1)[0]).toMatchObject({ messageId: AID });
	});

	test('carries the unavailable capability when it could not be read', async () => {
		h.getChatCapabilitySafe.mockResolvedValue({ available: false });
		script();
		await finalize.finalizeRun(RID, COMPLETED);
		expect(emitted(1).at(-1)).toMatchObject({ capability: { available: false } });
	});

	test('wakes the conversations listeners once, after the transaction committed', async () => {
		script({ updated: runRow({ status: 'completed', conversationId: 'conv-from-row' }) });
		await finalize.finalizeRun(RID, COMPLETED);
		expect(h.notifyConversation).toHaveBeenCalledTimes(1);
		expect(h.notifyConversation).toHaveBeenCalledWith('conv-from-row');
		expect(order(h.notifyConversation)).toBeGreaterThan(order(h.appendEvents, 1));
	});

	test('does not wake anyone when a step of the transaction fails', async () => {
		h.appendEvents.mockRejectedValueOnce(new Error('seq conflict'));
		script();
		await expect(finalize.finalizeRun(RID, COMPLETED)).rejects.toThrow('seq conflict');
		expect(h.notifyConversation).not.toHaveBeenCalled();
	});
});
