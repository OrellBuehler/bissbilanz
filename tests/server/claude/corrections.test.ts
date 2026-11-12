import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { createMockDB } from '../../helpers/mock-db';

const { db, queueResults, reset, getCalls } = createMockDB();

vi.mock('$lib/server/db', () => ({ getDB: () => db }));

const corrections = await import('$lib/server/claude/tasks/corrections');
const { LeaseLostError } = await import('$lib/server/claude/errors');

const render = (value: SQL) => new PgDialect().sqlToQuery(value).sql;
const fence = { taskId: 'task-1', instance: 'inst', attempt: 2, kind: 'correction' as const };
const ctx = (locale: string | null = 'en') => ({
	fence,
	userId: 'user-1',
	taskId: 'task-1',
	locale
});

const sets = () =>
	getCalls()
		.filter((call) => call.method === 'set')
		.map((call) => call.args[0]);
const values = () =>
	getCalls()
		.filter((call) => call.method === 'values')
		.map((call) => call.args[0]);

// Every fenced transaction first locks the task row, then the fenced correction row.
const fenced = (...after: unknown[]) => queueResults([[], [{ one: 1 }], ...after]);

beforeEach(() => reset());

afterEach(() => vi.useRealTimers());

describe('correctionFailureText', () => {
	test.each([
		['not_configured', 'not available for your account', 'gerade nicht verfügbar'],
		['disabled', 'not available for your account', 'gerade nicht verfügbar'],
		['no_access', 'not available for your account', 'gerade nicht verfügbar'],
		['user_budget_exhausted', 'monthly budget', 'Monatsbudget'],
		['global_budget_exhausted', 'monthly budget', 'Monatsbudget'],
		['claude_refused', 'declined', 'abgelehnt'],
		['claude_incomplete', 'could not finish', 'nicht abschliessen'],
		['task_changed', 'task changed', 'geändert, bevor'],
		['claude_error', 'could not process your reply', 'nicht verarbeiten']
	] as const)('%s in both languages', (code, en, de) => {
		expect(corrections.correctionFailureText(code, 'en')).toContain(en);
		expect(corrections.correctionFailureText(code, 'de')).toContain(de);
		expect(corrections.correctionFailureText(code, null)).toContain(en);
		expect(corrections.correctionFailureText(code, 'fr')).toContain(en);
	});
});

describe('claimCorrection', () => {
	test('claims a queued, due or abandoned correction and counts a reclaim as a failure', async () => {
		queueResults([[{ taskId: 'task-1', attempt: 3 }]]);
		expect(await corrections.claimCorrection('task-1', 'inst')).toEqual({
			taskId: 'task-1',
			attempt: 3
		});
		const [patch] = sets();
		expect(patch).toMatchObject({ state: 'running', leaseOwner: 'inst', nextAttemptAt: null });
		expect(render(patch.failures)).toContain(
			`CASE WHEN "claude_task_corrections"."state" = 'running'`
		);
		const where = getCalls().find((call) => call.method === 'where')!.args[0] as SQL;
		const sql = render(where);
		expect(sql).toContain('"claude_task_corrections"."next_attempt_at" <= now()');
		expect(sql).toContain('"claude_task_corrections"."lease_expires_at" < now()');
	});

	test('returns nothing when the correction is not claimable', async () => {
		queueResults([[]]);
		expect(await corrections.claimCorrection('task-1', 'inst')).toBeUndefined();
	});
});

describe('transitionCorrection', () => {
	test('releases the lease when leaving running', async () => {
		queueResults([[{ taskId: 'task-1' }]]);
		await corrections.transitionCorrection(db as never, fence, { state: 'failed' });
		expect(sets()[0]).toMatchObject({ state: 'failed', leaseOwner: null, leaseExpiresAt: null });
	});

	test('keeps the lease for a patch that stays running and throws without the fence', async () => {
		queueResults([[{ taskId: 'task-1' }]]);
		await corrections.transitionCorrection(db as never, fence, { failureDetail: 'x' });
		expect(sets()[0]).not.toHaveProperty('leaseOwner');
		queueResults([[]]);
		await expect(
			corrections.transitionCorrection(db as never, fence, { state: 'queued' })
		).rejects.toBeInstanceOf(LeaseLostError);
	});
});

describe('outcomes', () => {
	test('a failure answers in the thread and ends the run, leaving the task row alone', async () => {
		fenced([], [{ taskId: 'task-1' }]);
		await corrections.failCorrection(ctx('de'), 'claude_refused', 'detail');
		expect(values()[0]).toEqual({
			taskId: 'task-1',
			userId: 'user-1',
			role: 'assistant',
			text: 'Claude hat diese Anfrage abgelehnt. Es wurde nichts geändert.',
			outcome: 'failed'
		});
		const [state] = sets();
		expect(sets()).toHaveLength(1);
		expect(state).toMatchObject({
			state: 'failed',
			failureCode: 'claude_refused',
			failureDetail: 'detail'
		});
	});

	test('retries with backoff and fails on the last attempt', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
		fenced([{ taskId: 'task-1' }]);
		expect(await corrections.retryOrFailCorrection(ctx(), 0, 'server 529')).toBe('retry_wait');
		expect(sets()[0]).toMatchObject({
			state: 'retry_wait',
			failures: 1,
			failureDetail: 'server 529',
			nextAttemptAt: new Date('2026-10-12T10:01:00Z')
		});

		reset();
		fenced([{ taskId: 'task-1' }]);
		await corrections.retryOrFailCorrection(ctx(), 1, 'server 529');
		expect(sets()[0]!.nextAttemptAt).toEqual(new Date('2026-10-12T10:05:00Z'));

		reset();
		fenced([], [{ taskId: 'task-1' }]);
		expect(await corrections.retryOrFailCorrection(ctx(), 2, 'server 529')).toBe('failed');
		expect(values()[0]).toMatchObject({ outcome: 'failed' });
		expect(sets()[0]).toMatchObject({ state: 'failed', failureCode: 'claude_error' });
	});

	test('a requeue only puts the run back in the queue', async () => {
		fenced([{ taskId: 'task-1' }]);
		await corrections.requeueCorrection(ctx());
		expect(sets()).toEqual([expect.objectContaining({ state: 'queued', leaseOwner: null })]);
	});

	test('nothing is recorded without the lease', async () => {
		queueResults([[], []]);
		await expect(corrections.failCorrection(ctx(), 'claude_error')).rejects.toBeInstanceOf(
			LeaseLostError
		);
		expect(values()).toHaveLength(0);
	});
});

describe('failCorrectionsWithoutProcessor', () => {
	test('ends every waiting correction with a notice in the owner’s language', async () => {
		queueResults([
			[
				{ taskId: 'task-1', userId: 'user-de' },
				{ taskId: 'task-2', userId: 'user-en' }
			],
			[
				{ id: 'user-de', locale: 'de' },
				{ id: 'user-en', locale: 'en' }
			],
			[]
		]);
		expect(await corrections.failCorrectionsWithoutProcessor()).toBe(2);
		expect(sets()[0]).toMatchObject({
			state: 'failed',
			failureCode: 'not_configured',
			leaseOwner: null,
			nextAttemptAt: null
		});
		const where = getCalls().find((call) => call.method === 'where')!.args[0] as SQL;
		expect(new PgDialect().sqlToQuery(where).params).toEqual(['queued', 'running', 'retry_wait']);
		expect(values()[0]).toEqual([
			{
				taskId: 'task-1',
				userId: 'user-de',
				role: 'assistant',
				text: corrections.correctionFailureText('not_configured', 'de'),
				outcome: 'failed'
			},
			{
				taskId: 'task-2',
				userId: 'user-en',
				role: 'assistant',
				text: corrections.correctionFailureText('not_configured', 'en'),
				outcome: 'failed'
			}
		]);
	});

	test('writes nothing more when nothing waits', async () => {
		queueResults([[]]);
		expect(await corrections.failCorrectionsWithoutProcessor()).toBe(0);
		expect(values()).toHaveLength(0);
	});
});
