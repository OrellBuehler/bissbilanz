import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';
import * as executor from '$lib/server/claude/chat/executor';
import * as errors from '$lib/server/claude/errors';
import {
	MAX_CONCURRENT_CHAT_RUNS,
	STALE_RUN_MS,
	SWEEP_INTERVAL_MS
} from '$lib/server/claude/chat/constants';

const h = vi.hoisted(() => ({
	executeChatRun: vi.fn(),
	finalizeRun: vi.fn(),
	pruneTextDeltas: vi.fn(),
	assertClaudeGates: vi.fn(),
	onClaudeAccessChanged: vi.fn(),
	captureException: vi.fn()
}));

const { db, reset, queueResults, setError, getCalls } = createMockDB();

vi.mock('@sentry/sveltekit', () => ({
	captureException: h.captureException,
	addBreadcrumb: vi.fn(),
	logger: { info: vi.fn() }
}));
vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/claude/chat/runner', () => ({ executeChatRun: h.executeChatRun }));
vi.mock('$lib/server/claude/chat/finalize', () => ({ finalizeRun: h.finalizeRun }));
vi.mock('$lib/server/claude/chat/events', () => ({ pruneTextDeltas: h.pruneTextDeltas }));
vi.mock('$lib/server/claude/capability', () => ({ assertClaudeGates: h.assertClaudeGates }));
vi.mock('$lib/server/claude/events', () => ({ onClaudeAccessChanged: h.onClaudeAccessChanged }));

const deferred = () => {
	let resolve: () => void = () => {};
	let reject: (error: unknown) => void = () => {};
	const promise = new Promise<void>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
};

type Options = {
	signal: AbortSignal;
	instanceId: string;
	stopReason: () => string | undefined;
};

const jobs = new Map<string, ReturnType<typeof deferred>>();
const optionsOf = (runId: string): Options => {
	const call = h.executeChatRun.mock.calls.find(([id]) => id === runId);
	if (!call) throw new Error(`run ${runId} was not started`);
	return call[1] as Options;
};
const startedRuns = () => h.executeChatRun.mock.calls.map(([id]) => id);
const tick = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
	reset();
	jobs.clear();
	for (const fn of Object.values(h)) fn.mockReset();
	h.executeChatRun.mockImplementation(() => {
		const job = deferred();
		jobs.set(`${jobs.size}`, job);
		return job.promise;
	});
	h.finalizeRun.mockResolvedValue(null);
	h.pruneTextDeltas.mockResolvedValue(0);
	h.assertClaudeGates.mockResolvedValue(undefined);
});

afterEach(async () => {
	vi.clearAllTimers();
	while (jobs.size > 0) {
		const pending = [...jobs.values()];
		jobs.clear();
		for (const job of pending) job.resolve();
		await tick();
	}
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const jobOf = (index: number) => jobs.get(`${index}`)!;

describe('enqueueChatRun', () => {
	test('starts a queued run right away with this instance and an abort signal', async () => {
		executor.enqueueChatRun('run-1', 'user-1');
		expect(h.executeChatRun).toHaveBeenCalledTimes(1);
		expect(h.executeChatRun).toHaveBeenCalledWith('run-1', {
			signal: expect.any(AbortSignal),
			instanceId: expect.any(String),
			stopReason: expect.any(Function)
		});
		expect(optionsOf('run-1').signal.aborted).toBe(false);
		expect(optionsOf('run-1').stopReason()).toBeUndefined();
		expect(executor.isChatRunActiveHere('run-1')).toBe(true);
		expect(executor.isChatRunActiveHere('other')).toBe(false);
	});

	test('uses one instance id for every run of the process', async () => {
		executor.enqueueChatRun('run-1', 'user-1');
		executor.enqueueChatRun('run-2', 'user-2');
		expect(optionsOf('run-1').instanceId).toBe(optionsOf('run-2').instanceId);
	});

	test('releases the slot once the job is done', async () => {
		executor.enqueueChatRun('run-1', 'user-1');
		jobOf(0).resolve();
		await tick();
		expect(executor.isChatRunActiveHere('run-1')).toBe(false);
		executor.enqueueChatRun('run-1', 'user-1');
		expect(h.executeChatRun).toHaveBeenCalledTimes(2);
	});

	test('ignores a run that is already active', async () => {
		executor.enqueueChatRun('run-1', 'user-1');
		executor.enqueueChatRun('run-1', 'user-1');
		expect(h.executeChatRun).toHaveBeenCalledTimes(1);
	});

	test('runs at most MAX_CONCURRENT_CHAT_RUNS jobs and starts waiting ones in order', async () => {
		const ids = Array.from({ length: MAX_CONCURRENT_CHAT_RUNS + 2 }, (_, index) => `run-${index}`);
		for (const id of ids) executor.enqueueChatRun(id, 'user-1');
		expect(startedRuns()).toEqual(ids.slice(0, MAX_CONCURRENT_CHAT_RUNS));

		jobOf(1).resolve();
		await tick();
		expect(startedRuns()).toEqual(ids.slice(0, MAX_CONCURRENT_CHAT_RUNS + 1));
		jobOf(0).resolve();
		await tick();
		expect(startedRuns()).toEqual(ids);
		expect(executor.isChatRunActiveHere(ids[1]!)).toBe(false);
		expect(executor.isChatRunActiveHere(ids.at(-1)!)).toBe(true);
	});

	test('queues a duplicate wake-up only once', async () => {
		for (let index = 0; index < MAX_CONCURRENT_CHAT_RUNS; index++) {
			executor.enqueueChatRun(`busy-${index}`, 'user-1');
		}
		executor.enqueueChatRun('waiting', 'user-1');
		executor.enqueueChatRun('waiting', 'user-1');
		jobOf(0).resolve();
		await tick();
		expect(startedRuns().filter((id) => id === 'waiting')).toHaveLength(1);
		jobOf(1).resolve();
		await tick();
		expect(startedRuns().filter((id) => id === 'waiting')).toHaveLength(1);
		expect(h.executeChatRun).toHaveBeenCalledTimes(MAX_CONCURRENT_CHAT_RUNS + 1);
	});

	test('reports a failed job to Sentry and keeps pumping the queue', async () => {
		for (let index = 0; index < MAX_CONCURRENT_CHAT_RUNS; index++) {
			executor.enqueueChatRun(`run-${index}`, 'user-1');
		}
		executor.enqueueChatRun('next', 'user-1');
		const failure = new Error('boom');
		jobOf(0).reject(failure);
		await tick();
		expect(h.captureException).toHaveBeenCalledWith(failure, {
			tags: { job: 'chat-run' },
			extra: { runId: 'run-0' }
		});
		expect(executor.isChatRunActiveHere('run-0')).toBe(false);
		expect(startedRuns()).toContain('next');
	});
});

describe('stopChatRun', () => {
	test('returns false for a run it does not know', async () => {
		await expect(executor.stopChatRun('unknown', 'cancel')).resolves.toBe(false);
	});

	test('drops a queued run without ever starting it', async () => {
		for (let index = 0; index < MAX_CONCURRENT_CHAT_RUNS; index++) {
			executor.enqueueChatRun(`run-${index}`, 'user-1');
		}
		executor.enqueueChatRun('queued', 'user-1');
		await expect(executor.stopChatRun('queued', 'cancel')).resolves.toBe(false);
		jobOf(0).resolve();
		await tick();
		expect(startedRuns()).not.toContain('queued');
		executor.enqueueChatRun('queued', 'user-1');
		expect(startedRuns()).toContain('queued');
	});

	test('aborts an active run, records why and waits until the job wound down', async () => {
		executor.enqueueChatRun('run-1', 'user-1');
		const { signal, stopReason } = optionsOf('run-1');
		signal.addEventListener('abort', () => jobOf(0).resolve());
		await expect(executor.stopChatRun('run-1', 'cancel')).resolves.toBe(true);
		expect(signal.aborted).toBe(true);
		expect(stopReason()).toBe('cancel');
		expect(executor.isChatRunActiveHere('run-1')).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('keeps the first stop reason', async () => {
		executor.enqueueChatRun('run-1', 'user-1');
		const first = executor.stopChatRun('run-1', 'cancel');
		const second = executor.stopChatRun('run-1', 'deleted');
		expect(optionsOf('run-1').stopReason()).toBe('cancel');
		jobOf(0).resolve();
		await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
	});

	test('stops waiting after ten seconds when the job does not wind down', async () => {
		executor.enqueueChatRun('run-1', 'user-1');
		const stopped = vi.fn();
		void executor.stopChatRun('run-1', 'gate').then(stopped);
		await vi.advanceTimersByTimeAsync(9_999);
		expect(stopped).not.toHaveBeenCalled();
		expect(optionsOf('run-1').signal.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(1);
		expect(stopped).toHaveBeenCalledWith(true);
		expect(executor.isChatRunActiveHere('run-1')).toBe(true);
	});
});

describe('abortChatRunsWhereGated', () => {
	test('aborts the runs of users whose gates closed and leaves the others', async () => {
		h.assertClaudeGates.mockImplementation(async (userId: string) => {
			if (userId === 'user-a') throw new errors.ClaudeGateError('disabled');
		});
		executor.enqueueChatRun('a-1', 'user-a');
		executor.enqueueChatRun('a-2', 'user-a');
		executor.enqueueChatRun('b-1', 'user-b');
		await executor.abortChatRunsWhereGated();
		expect(optionsOf('a-1').signal.aborted).toBe(true);
		expect(optionsOf('a-2').signal.aborted).toBe(true);
		expect(optionsOf('a-1').stopReason()).toBe('gate');
		expect(optionsOf('b-1').signal.aborted).toBe(false);
		expect(optionsOf('b-1').stopReason()).toBeUndefined();
		expect(h.assertClaudeGates.mock.calls.map(([id]) => id).sort()).toEqual(['user-a', 'user-b']);
	});

	test('checks only the given user', async () => {
		h.assertClaudeGates.mockRejectedValue(new errors.ClaudeGateError('no_access'));
		executor.enqueueChatRun('a-1', 'user-a');
		executor.enqueueChatRun('b-1', 'user-b');
		await executor.abortChatRunsWhereGated('user-b');
		expect(h.assertClaudeGates).toHaveBeenCalledTimes(1);
		expect(h.assertClaudeGates).toHaveBeenCalledWith('user-b');
		expect(optionsOf('a-1').signal.aborted).toBe(false);
		expect(optionsOf('b-1').signal.aborted).toBe(true);
	});

	test('does nothing when no run is active here', async () => {
		await executor.abortChatRunsWhereGated('user-a');
		expect(h.assertClaudeGates).not.toHaveBeenCalled();
	});

	test('does not replace a reason that was already recorded', async () => {
		h.assertClaudeGates.mockRejectedValue(new errors.ClaudeGateError('disabled'));
		executor.enqueueChatRun('run-1', 'user-a');
		void executor.stopChatRun('run-1', 'cancel');
		await executor.abortChatRunsWhereGated();
		expect(optionsOf('run-1').stopReason()).toBe('cancel');
	});

	test('rethrows an error that is not a closed gate', async () => {
		h.assertClaudeGates.mockRejectedValue(new Error('db down'));
		executor.enqueueChatRun('run-1', 'user-a');
		await expect(executor.abortChatRunsWhereGated()).rejects.toThrow('db down');
		expect(optionsOf('run-1').signal.aborted).toBe(false);
	});

	test('keeps checking the other owners after one whose gates are open', async () => {
		h.assertClaudeGates.mockImplementation(async (userId: string) => {
			if (userId === 'user-b') throw new errors.ClaudeGateError('no_access');
		});
		executor.enqueueChatRun('a-1', 'user-a');
		executor.enqueueChatRun('b-1', 'user-b');
		await executor.abortChatRunsWhereGated();
		expect(optionsOf('a-1').signal.aborted).toBe(false);
		expect(optionsOf('b-1').signal.aborted).toBe(true);
	});
});

describe('sweepChatRuns', () => {
	test('interrupts stale runs it is not working on and skips the ones active here', async () => {
		executor.enqueueChatRun('active-1', 'user-1');
		queueResults([[{ id: 'stale-1' }, { id: 'active-1' }, { id: 'stale-2' }], [], []]);
		await executor.sweepChatRuns();
		expect(h.finalizeRun.mock.calls).toEqual([
			['stale-1', { status: 'interrupted', reason: 'server_restart', requireStale: true }],
			['stale-2', { status: 'interrupted', reason: 'server_restart', requireStale: true }]
		]);
	});

	test('cancels runs whose confirmation expired', async () => {
		queueResults([[], [{ runId: 'run-1' }, { runId: 'run-2' }], []]);
		await executor.sweepChatRuns();
		const ending = {
			status: 'cancelled',
			reason: 'action_expired',
			actionStatus: 'expired',
			onlyIf: ['awaiting_confirmation']
		};
		expect(h.finalizeRun.mock.calls).toEqual([
			['run-1', ending],
			['run-2', ending]
		]);
		expect(getCalls().map((call) => call.method)).toContain('selectDistinct');
	});

	test('enqueues queued runs nobody works on and prunes old text deltas last', async () => {
		queueResults([
			[],
			[],
			[
				{ id: 'queued-1', userId: 'user-1' },
				{ id: 'queued-2', userId: 'user-2' }
			]
		]);
		h.pruneTextDeltas.mockImplementation(async () => {
			expect(startedRuns()).toEqual(['queued-1', 'queued-2']);
			return 3;
		});
		await executor.sweepChatRuns();
		expect(h.executeChatRun).toHaveBeenCalledWith('queued-1', expect.anything());
		expect(h.executeChatRun).toHaveBeenCalledWith('queued-2', expect.anything());
		expect(h.pruneTextDeltas).toHaveBeenCalledTimes(1);
		expect(h.finalizeRun).not.toHaveBeenCalled();
	});

	test('does nothing but prune when there is nothing to sweep', async () => {
		await executor.sweepChatRuns();
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(h.executeChatRun).not.toHaveBeenCalled();
		expect(h.pruneTextDeltas).toHaveBeenCalledTimes(1);
	});
});

describe('reconcileConversation', () => {
	const running = (overrides: Record<string, unknown> = {}) => ({
		id: 'run-1',
		status: 'running',
		heartbeatAt: new Date(Date.now() - 1000),
		...overrides
	});
	const interrupted = {
		status: 'interrupted',
		reason: 'server_restart',
		requireStale: true
	};

	test('does nothing without an open run', async () => {
		queueResults([[]]);
		await executor.reconcileConversation('conv-1');
		expect(h.finalizeRun).not.toHaveBeenCalled();
	});

	test('leaves a running run with a fresh heartbeat alone', async () => {
		queueResults([[running()]]);
		await executor.reconcileConversation('conv-1');
		expect(h.finalizeRun).not.toHaveBeenCalled();
	});

	test('leaves a run alone that is exactly at the staleness limit', async () => {
		queueResults([[running({ heartbeatAt: new Date(Date.now() - STALE_RUN_MS) })]]);
		await executor.reconcileConversation('conv-1');
		expect(h.finalizeRun).not.toHaveBeenCalled();
	});

	test('interrupts a running run whose heartbeat went stale', async () => {
		queueResults([[running({ heartbeatAt: new Date(Date.now() - STALE_RUN_MS - 1) })]]);
		await executor.reconcileConversation('conv-1');
		expect(h.finalizeRun).toHaveBeenCalledWith('run-1', interrupted);
	});

	test('interrupts a running run that never sent a heartbeat', async () => {
		queueResults([[running({ heartbeatAt: null })]]);
		await executor.reconcileConversation('conv-1');
		expect(h.finalizeRun).toHaveBeenCalledWith('run-1', interrupted);
	});

	test('leaves a stale run alone while this process is working on it', async () => {
		executor.enqueueChatRun('run-1', 'user-1');
		queueResults([[running({ heartbeatAt: null })]]);
		await executor.reconcileConversation('conv-1');
		expect(h.finalizeRun).not.toHaveBeenCalled();
	});

	test('cancels a run awaiting confirmation when its action expired', async () => {
		queueResults([[running({ status: 'awaiting_confirmation' })], [{ id: 'call-1' }]]);
		await executor.reconcileConversation('conv-1');
		expect(h.finalizeRun).toHaveBeenCalledTimes(1);
		expect(h.finalizeRun).toHaveBeenCalledWith('run-1', {
			status: 'cancelled',
			reason: 'action_expired',
			actionStatus: 'expired',
			onlyIf: ['awaiting_confirmation']
		});
	});

	test('keeps a run awaiting confirmation while its action is still valid', async () => {
		queueResults([[running({ status: 'awaiting_confirmation' })], []]);
		await executor.reconcileConversation('conv-1');
		expect(h.finalizeRun).not.toHaveBeenCalled();
	});
});

describe('settleChatRunsForTests', () => {
	test('resolves immediately when nothing is running', async () => {
		await expect(executor.settleChatRunsForTests()).resolves.toBeUndefined();
	});

	test('waits for active and queued runs alike', async () => {
		const total = MAX_CONCURRENT_CHAT_RUNS + 1;
		for (let index = 0; index < total; index++) executor.enqueueChatRun(`run-${index}`, 'user-1');
		const settled = vi.fn();
		void executor.settleChatRunsForTests().then(settled);
		await tick();
		expect(settled).not.toHaveBeenCalled();

		for (let index = 0; index < MAX_CONCURRENT_CHAT_RUNS; index++) jobOf(index).resolve();
		await tick();
		expect(startedRuns()).toHaveLength(total);
		expect(settled).not.toHaveBeenCalled();

		jobOf(MAX_CONCURRENT_CHAT_RUNS).resolve();
		await tick();
		expect(settled).toHaveBeenCalledTimes(1);
	});
});

describe('startChatWorker', () => {
	// one worker per process, so everything it does is checked in a single run
	test('starts one worker: access listener, a sweep now and one per interval, failures reported', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		queueResults([[], [], [{ id: 'queued-1', userId: 'user-a' }]]);
		executor.startChatWorker();
		executor.startChatWorker();
		await tick();
		expect(h.onClaudeAccessChanged).toHaveBeenCalledTimes(1);
		expect(h.pruneTextDeltas).toHaveBeenCalledTimes(1);
		expect(startedRuns()).toEqual(['queued-1']);

		h.assertClaudeGates.mockRejectedValue(new errors.ClaudeGateError('disabled'));
		const listener = h.onClaudeAccessChanged.mock.calls[0]![0] as (change: {
			userId?: string;
		}) => Promise<void>;
		await listener({ userId: 'user-a' });
		expect(h.assertClaudeGates).toHaveBeenCalledWith('user-a');
		expect(optionsOf('queued-1').signal.aborted).toBe(true);
		expect(optionsOf('queued-1').stopReason()).toBe('gate');

		await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS - 1);
		expect(h.pruneTextDeltas).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(h.pruneTextDeltas).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
		expect(h.pruneTextDeltas).toHaveBeenCalledTimes(3);

		const failure = new Error('db down');
		setError(failure);
		await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
		expect(log).toHaveBeenCalledWith('[chat-sweep] Error:', failure);
		expect(h.captureException).toHaveBeenCalledWith(failure, { tags: { job: 'chat-sweep' } });
		expect(h.pruneTextDeltas).toHaveBeenCalledTimes(3);

		reset();
		await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
		expect(h.pruneTextDeltas).toHaveBeenCalledTimes(4);
		expect(h.captureException).toHaveBeenCalledTimes(1);
	});
});
