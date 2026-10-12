import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const { db, queueResults, setResult, reset, getCalls } = createMockDB();

vi.mock('$lib/server/db', () => ({ getDB: () => db }));

const runs = await import('$lib/server/claude/tasks/runs');
const { LeaseLostError } = await import('$lib/server/claude/errors');

const fence = { taskId: 'task-1', instance: 'inst', attempt: 2 };
const methods = () => getCalls().map((call) => call.method);
const setArgs = () =>
	getCalls()
		.filter((call) => call.method === 'set')
		.map((call) => call.args[0]);

beforeEach(() => {
	reset();
});

describe('run rows', () => {
	test('ensureRun inserts idempotently', async () => {
		await runs.ensureRun('user-1', 'task-1');
		expect(methods()).toEqual(expect.arrayContaining(['insert', 'values', 'onConflictDoNothing']));
	});

	test('loadRun returns the row or nothing', async () => {
		setResult([{ taskId: 'task-1' }]);
		expect(await runs.loadRun('task-1')).toEqual({ taskId: 'task-1' });
		setResult([]);
		expect(await runs.loadRun('task-1')).toBeUndefined();
	});

	test('listRunsByTaskIds skips the query for no ids', async () => {
		expect(await runs.listRunsByTaskIds([])).toEqual([]);
		expect(getCalls()).toHaveLength(0);
		setResult([{ taskId: 'a' }]);
		expect(await runs.listRunsByTaskIds(['a'])).toEqual([{ taskId: 'a' }]);
	});

	test('claimRun returns the claimed row, bumping the attempt and the lease', async () => {
		setResult([{ taskId: 'task-1', attempt: 1 }]);
		expect(await runs.claimRun('task-1', 'inst')).toEqual({ taskId: 'task-1', attempt: 1 });
		const [patch] = setArgs();
		expect(patch).toMatchObject({
			state: 'running',
			leaseOwner: 'inst',
			nextAttemptAt: null,
			proposal: null
		});
		setResult([]);
		expect(await runs.claimRun('task-1', 'inst')).toBeUndefined();
	});

	test('supersedeUnclaimedRun marks the run superseded without a lease', async () => {
		await runs.supersedeUnclaimedRun('task-1');
		expect(setArgs()[0]).toMatchObject({
			state: 'superseded',
			leaseOwner: null,
			leaseExpiresAt: null
		});
	});

	test('supersedeIfProcessorChanged only acts when the processor is not claude', async () => {
		setResult([{ processor: 'claude' }]);
		await runs.supersedeIfProcessorChanged('task-1');
		setResult([]);
		await runs.supersedeIfProcessorChanged('task-1');
		expect(methods()).not.toContain('update');
		setResult([{ processor: 'assistant' }]);
		await runs.supersedeIfProcessorChanged('task-1');
		expect(methods()).toContain('update');
	});

	test('heartbeat reports whether the fenced row was extended', async () => {
		setResult([{ taskId: 'task-1' }]);
		expect(await runs.heartbeat(fence)).toBe(true);
		setResult([]);
		expect(await runs.heartbeat(fence)).toBe(false);
	});
});

describe('withFence', () => {
	test('runs the callback inside the fenced transaction', async () => {
		queueResults([[{ one: 1 }]]);
		expect(await runs.withFence(fence, async () => 'done')).toBe('done');
		expect(methods()).toEqual(expect.arrayContaining(['transaction', 'for']));
	});

	test('throws LeaseLostError without running the callback when the fence does not hold', async () => {
		queueResults([[]]);
		const fn = vi.fn();
		await expect(runs.withFence(fence, fn)).rejects.toBeInstanceOf(LeaseLostError);
		expect(fn).not.toHaveBeenCalled();
	});
});

describe('transitionFenced', () => {
	test('clears the lease when the run leaves running', async () => {
		setResult([{ taskId: 'task-1' }]);
		await runs.transitionFenced(db as never, fence, { state: 'blocked', failureCode: 'disabled' });
		expect(setArgs()[0]).toMatchObject({
			state: 'blocked',
			failureCode: 'disabled',
			leaseOwner: null,
			leaseExpiresAt: null
		});
	});

	test('keeps the lease for updates that stay running', async () => {
		setResult([{ taskId: 'task-1' }]);
		await runs.transitionFenced(db as never, fence, { proposal: { items: [] } });
		expect(setArgs()[0]).not.toHaveProperty('leaseOwner');
		await runs.transitionFenced(db as never, fence, { state: 'running' });
		expect(setArgs()[1]).not.toHaveProperty('leaseOwner');
	});

	test('throws LeaseLostError when no fenced row was updated', async () => {
		setResult([]);
		await expect(
			runs.transitionFenced(db as never, fence, { state: 'dismissed' })
		).rejects.toBeInstanceOf(LeaseLostError);
	});
});

describe('ledgerGetOrCreate', () => {
	test('inserts a new key with a generated entry id', async () => {
		queueResults([[{ one: 1 }], [{ entryId: 'e1' }]]);
		expect(await runs.ledgerGetOrCreate(db as never, fence, 'k', 'summary')).toEqual({
			entryId: 'e1',
			created: true
		});
		expect(getCalls().find((call) => call.method === 'values')!.args[0]).toMatchObject({
			taskId: 'task-1',
			key: 'k',
			summary: 'summary',
			entryId: expect.stringMatching(/^[0-9a-f-]{36}$/)
		});
	});

	test('returns the id written the first time for a known key', async () => {
		queueResults([[{ one: 1 }], [], [{ entryId: 'e0' }]]);
		expect(await runs.ledgerGetOrCreate(db as never, fence, 'k', 's')).toEqual({
			entryId: 'e0',
			created: false
		});
	});

	test('fails fenced and on a vanished row', async () => {
		queueResults([[]]);
		await expect(runs.ledgerGetOrCreate(db as never, fence, 'k', 's')).rejects.toBeInstanceOf(
			LeaseLostError
		);
		queueResults([[{ one: 1 }], [], []]);
		await expect(runs.ledgerGetOrCreate(db as never, fence, 'k', 's')).rejects.toThrow('vanished');
	});
});

describe('listLoggedLedger', () => {
	test('returns the ledger rows whose entry still exists', async () => {
		setResult([{ entryId: 'e1', summary: 'Toast' }]);
		expect(await runs.listLoggedLedger(db as never, 'task-1', 'user-1')).toEqual([
			{ entryId: 'e1', summary: 'Toast' }
		]);
		expect(methods()).toContain('innerJoin');
	});
});
