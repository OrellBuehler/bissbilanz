import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { createMockDB } from '../../helpers/mock-db';

const h = vi.hoisted(() => ({
	getClaudeGateState: vi.fn(),
	wake: vi.fn(),
	captureException: vi.fn()
}));

const { db, queueResults, reset, getCalls } = createMockDB();

vi.mock('@sentry/sveltekit', () => ({ captureException: h.captureException }));
vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/claude/capability', () => ({ getClaudeGateState: h.getClaudeGateState }));
vi.mock('$lib/server/claude/tasks/executor', () => ({ wakeClaudeCorrection: h.wake }));

const replies = await import('$lib/server/claude/tasks/replies');

const OPEN = { available: true, remainingUsd: 5, blockedBy: null };
const task = (overrides: Record<string, unknown> = {}) => ({
	id: 'task-1',
	userId: 'user-1',
	status: 'completed',
	processedBy: 'claude',
	...overrides
});
const window = (count = 0, oldest: Date | null = null) => [{ count, oldest }];

beforeEach(() => {
	reset();
	for (const fn of Object.values(h)) fn.mockReset();
	h.getClaudeGateState.mockResolvedValue(OPEN);
});

afterEach(() => vi.useRealTimers());

describe('replyBlockedReason', () => {
	const facts = (overrides: Record<string, unknown> = {}) => ({
		processedBy: 'claude',
		status: 'completed',
		correctionState: null,
		answeredReplies: 0,
		gate: null,
		window: { count: 0, oldest: null },
		...overrides
	});

	test('allows a reply on an idle completed Claude task', () => {
		expect(replies.replyBlockedReason(facts())).toBeNull();
		for (const state of ['succeeded', 'failed'] as const) {
			expect(replies.replyBlockedReason(facts({ correctionState: state }))).toBeNull();
		}
	});

	test('checks in a fixed order', () => {
		expect(
			replies.replyBlockedReason(
				facts({ processedBy: 'assistant', status: 'pending', correctionState: 'queued' })
			)
		).toBe('not_processed_by_server');
		expect(
			replies.replyBlockedReason(facts({ status: 'dismissed', correctionState: 'queued' }))
		).toBe('not_completed');
		for (const state of ['queued', 'running', 'retry_wait'] as const) {
			expect(
				replies.replyBlockedReason(facts({ correctionState: state, answeredReplies: 9 }))
			).toBe('correction_in_flight');
		}
		expect(
			replies.replyBlockedReason(facts({ answeredReplies: 5, gate: 'budget_exhausted' }))
		).toBe('reply_limit_reached');
		expect(
			replies.replyBlockedReason(
				facts({ gate: 'processor_unavailable', window: { count: 99, oldest: null } })
			)
		).toBe('processor_unavailable');
		expect(replies.replyBlockedReason(facts({ window: { count: 20, oldest: null } }))).toBe(
			'rate_limited'
		);
	});
});

describe('ReplyRejectedError', () => {
	test.each([
		['task_not_found', 404],
		['not_processed_by_server', 409],
		['not_completed', 409],
		['correction_in_flight', 409],
		['reply_limit_reached', 409],
		['processor_unavailable', 403],
		['budget_exhausted', 403],
		['rate_limited', 429]
	] as const)('%s is a %s', (code, status) => {
		const error = new replies.ReplyRejectedError(code);
		expect(error).toMatchObject({ code, status, retryAfterSeconds: null });
		expect(error.message.length).toBeGreaterThan(0);
	});
});

describe('postTaskReply', () => {
	const posting = (
		options: {
			task?: unknown[];
			correction?: unknown[];
			replies?: number;
			window?: unknown[];
		} = {}
	) =>
		queueResults([
			options.task ?? [task()],
			options.correction ?? [],
			[{ count: options.replies ?? 0 }],
			options.window ?? window(),
			[{ id: 'message-1' }],
			[]
		]);

	test('adds the reply, queues the correction and wakes it', async () => {
		posting({ correction: [{ state: 'failed' }] });
		const result = await replies.postTaskReply('user-1', 'task-1', 'That was 250 g');
		expect(result).toMatchObject({ id: 'task-1' });
		const inserted = getCalls()
			.filter((call) => call.method === 'values')
			.map((call) => call.args[0]);
		expect(inserted[0]).toEqual({
			taskId: 'task-1',
			userId: 'user-1',
			role: 'user',
			text: 'That was 250 g'
		});
		expect(inserted[1]).toMatchObject({
			taskId: 'task-1',
			userId: 'user-1',
			messageId: 'message-1',
			state: 'queued',
			failures: 0,
			failureCode: null,
			leaseOwner: null
		});
		const upsert = getCalls().find((call) => call.method === 'onConflictDoUpdate')!.args[0];
		expect(upsert.set).toMatchObject({ messageId: 'message-1', state: 'queued', failures: 0 });
		expect(getCalls().filter((call) => call.method === 'for')).toHaveLength(2);
		expect(getCalls().some((call) => call.method === 'update')).toBe(false);
		const counted = getCalls().filter((call) => call.method === 'where')[2]!.args[0] as SQL;
		const { sql, params } = new PgDialect().sqlToQuery(counted);
		expect(sql).toContain('"claude_task_messages"."outcome" <>');
		expect(params).toEqual(['task-1', 'assistant', 'failed']);
		expect(h.wake).toHaveBeenCalledWith('task-1', 'user-1');
	});

	test.each([
		['task_not_found', { task: [] }],
		['not_processed_by_server', { task: [task({ processedBy: 'on_device' })] }],
		['not_completed', { task: [task({ status: 'dismissed' })] }],
		['correction_in_flight', { correction: [{ state: 'running' }] }],
		['reply_limit_reached', { replies: 5 }]
	] as const)('rejects with %s and writes nothing', async (code, options) => {
		const arrange = options as Parameters<typeof posting>[0];
		posting(arrange);
		await expect(replies.postTaskReply('user-1', 'task-1', 'hi')).rejects.toMatchObject({ code });
		expect(getCalls().some((call) => call.method === 'insert')).toBe(false);
		expect(h.wake).not.toHaveBeenCalled();
	});

	test.each([
		[{ available: false, remainingUsd: 0, blockedBy: 'no_access' }, 'processor_unavailable'],
		[{ available: false, remainingUsd: 0, blockedBy: 'disabled' }, 'processor_unavailable'],
		[
			{ available: false, remainingUsd: 0.1, blockedBy: 'user_budget_exhausted' },
			'budget_exhausted'
		],
		[
			{ available: false, remainingUsd: 0.1, blockedBy: 'global_budget_exhausted' },
			'budget_exhausted'
		]
	])('rejects a closed gate %o as %s', async (gate, code) => {
		h.getClaudeGateState.mockResolvedValue(gate);
		posting();
		await expect(replies.postTaskReply('user-1', 'task-1', 'hi')).rejects.toMatchObject({
			code,
			status: 403
		});
	});

	test('rate-limits per day and says when the oldest reply leaves the window', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
		posting({ window: window(20, new Date('2026-10-12T02:00:00Z')) });
		await expect(replies.postTaskReply('user-1', 'task-1', 'hi')).rejects.toMatchObject({
			code: 'rate_limited',
			status: 429,
			retryAfterSeconds: 14 * 3600
		});
	});

	test('lets a failing gate check through', async () => {
		h.getClaudeGateState.mockRejectedValue(new Error('db down'));
		await expect(replies.postTaskReply('user-1', 'task-1', 'hi')).rejects.toThrow('db down');
	});
});

describe('loadClaudeThreads', () => {
	test('reads nothing without a task Claude processed', async () => {
		const threads = await replies.loadClaudeThreads([task({ processedBy: 'assistant' })]);
		expect(threads.size).toBe(0);
		expect(getCalls()).toHaveLength(0);
	});

	test('builds the thread of every Claude task that can take or has a conversation', async () => {
		const at = new Date('2026-10-12T08:00:00Z');
		queueResults([
			[
				{
					id: 'm1',
					taskId: 'task-1',
					role: 'user',
					text: 'hi',
					outcome: null,
					readAt: null,
					createdAt: at
				},
				{
					id: 'm2',
					taskId: 'task-1',
					role: 'assistant',
					text: 'hello',
					outcome: 'answered',
					readAt: null,
					createdAt: at
				},
				{
					id: 'm3',
					taskId: 'task-3',
					role: 'assistant',
					text: 'seen',
					outcome: 'changed',
					readAt: at,
					createdAt: at
				}
			],
			[
				{ taskId: 'task-1', state: 'retry_wait' },
				{ taskId: 'task-3', state: 'succeeded' }
			],
			window(1)
		]);
		const threads = await replies.loadClaudeThreads([
			task(),
			task({ id: 'task-2', status: 'dismissed' }),
			task({ id: 'task-3', status: 'pending' }),
			task({ id: 'task-4' })
		]);
		expect([...threads.keys()]).toEqual(['task-1', 'task-3', 'task-4']);
		expect(threads.get('task-1')).toEqual({
			messages: [
				{
					id: 'm1',
					role: 'user',
					text: 'hi',
					outcome: null,
					createdAt: at.toISOString(),
					unread: false
				},
				{
					id: 'm2',
					role: 'assistant',
					text: 'hello',
					outcome: 'answered',
					createdAt: at.toISOString(),
					unread: true
				}
			],
			correctionState: 'retrying',
			canReply: false,
			replyBlockedReason: 'correction_in_flight',
			repliesRemaining: 3,
			unreadReplies: 1
		});
		expect(threads.get('task-3')).toMatchObject({
			correctionState: 'idle',
			replyBlockedReason: 'not_completed',
			unreadReplies: 0
		});
		expect(threads.get('task-4')).toMatchObject({
			messages: [],
			canReply: true,
			repliesRemaining: 5
		});
		expect(h.getClaudeGateState).toHaveBeenCalledTimes(1);
	});

	test('does not count a reply whose correction failed', async () => {
		const at = new Date('2026-10-12T08:00:00Z');
		const message = (id: string, role: string, outcome: string | null) => ({
			id,
			taskId: 'task-1',
			role,
			text: id,
			outcome,
			readAt: at,
			createdAt: at
		});
		queueResults([
			[
				message('u1', 'user', null),
				message('a1', 'assistant', 'failed'),
				message('u2', 'user', null),
				message('a2', 'assistant', 'changed')
			],
			[{ taskId: 'task-1', state: 'succeeded' }],
			window(2)
		]);
		const threads = await replies.loadClaudeThreads([task()]);
		expect(threads.get('task-1')).toMatchObject({ canReply: true, repliesRemaining: 4 });
	});

	test('treats a failing gate check as unavailable and reports it', async () => {
		h.getClaudeGateState.mockRejectedValue(new Error('db down'));
		queueResults([[], [], window()]);
		const threads = await replies.loadClaudeThreads([task()]);
		expect(threads.get('task-1')).toMatchObject({
			canReply: false,
			replyBlockedReason: 'processor_unavailable'
		});
		expect(h.captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { job: 'claude-reply-gate' }
		});
	});
});

describe('markRepliesRead', () => {
	test('marks Claude answers read and counts them', async () => {
		queueResults([[{ id: 'm1' }, { id: 'm2' }]]);
		expect(await replies.markRepliesRead('user-1', ['m1', 'm2'])).toBe(2);
		expect(getCalls().find((call) => call.method === 'set')!.args[0].readAt).toBeInstanceOf(Date);
	});

	test('does nothing for an empty selection', async () => {
		expect(await replies.markRepliesRead('user-1', [])).toBe(0);
		expect(getCalls()).toHaveLength(0);
	});

	test('counts only the named answers that were still unread', async () => {
		queueResults([[{ id: 'm1' }]]);
		expect(await replies.markRepliesRead('user-1', ['m1', 'm-already-read'])).toBe(1);
	});
});
