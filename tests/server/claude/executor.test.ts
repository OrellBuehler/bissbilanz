import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const h = vi.hoisted(() => ({
	processTask: vi.fn(),
	ensureRun: vi.fn(),
	getClaudeCapability: vi.fn(),
	assertClaudeAllowed: vi.fn(),
	abandonStaleReservations: vi.fn(),
	captureException: vi.fn(),
	configured: { value: true }
}));

const { db, setResult, queueResults, setError, reset } = createMockDB();

vi.mock('@sentry/sveltekit', () => ({
	captureException: h.captureException,
	addBreadcrumb: vi.fn(),
	logger: { info: vi.fn() }
}));
vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/claude/config', () => ({ isClaudeConfigured: () => h.configured.value }));
vi.mock('$lib/server/claude/tasks/processor', () => ({ processTask: h.processTask }));
vi.mock('$lib/server/claude/tasks/runs', () => ({ ensureRun: h.ensureRun }));
vi.mock('$lib/server/claude/capability', () => ({
	getClaudeCapability: h.getClaudeCapability,
	assertClaudeAllowed: h.assertClaudeAllowed
}));
vi.mock('$lib/server/claude/budget', () => ({
	abandonStaleReservations: h.abandonStaleReservations
}));

const load = async () => {
	vi.resetModules();
	const [executor, events, errors] = await Promise.all([
		import('$lib/server/claude/tasks/executor'),
		import('$lib/server/claude/events'),
		import('$lib/server/claude/errors')
	]);
	return { executor, events, errors };
};

const deferred = () => {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
	reset();
	for (const fn of [
		h.processTask,
		h.ensureRun,
		h.getClaudeCapability,
		h.assertClaudeAllowed,
		h.abandonStaleReservations,
		h.captureException
	]) {
		fn.mockReset();
	}
	h.configured.value = true;
	h.processTask.mockResolvedValue(undefined);
	h.ensureRun.mockResolvedValue(undefined);
	h.abandonStaleReservations.mockResolvedValue(0);
	h.getClaudeCapability.mockResolvedValue({ available: true, remainingBudgetUsd: 5 });
	h.assertClaudeAllowed.mockResolvedValue(undefined);
	queueResults([[{ processor: 'claude' }]]);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('enqueueClaudeTaskIfEligible', () => {
	test('creates a run and processes the task for users routed to claude', async () => {
		const { executor } = await load();
		await executor.enqueueClaudeTaskIfEligible('user-1', 'task-1');
		await settle();
		expect(h.ensureRun).toHaveBeenCalledWith('user-1', 'task-1');
		expect(h.processTask).toHaveBeenCalledWith('task-1', {
			signal: expect.any(AbortSignal),
			instanceId: expect.any(String)
		});
	});

	test('does nothing without a key or when the user routes elsewhere', async () => {
		const { executor } = await load();
		h.configured.value = false;
		await executor.enqueueClaudeTaskIfEligible('user-1', 'task-1');
		h.configured.value = true;
		reset();
		queueResults([[{ processor: 'assistant' }]]);
		await executor.enqueueClaudeTaskIfEligible('user-1', 'task-2');
		reset();
		queueResults([[]]);
		await executor.enqueueClaudeTaskIfEligible('user-1', 'task-3');
		await settle();
		expect(h.ensureRun).not.toHaveBeenCalled();
		expect(h.processTask).not.toHaveBeenCalled();
	});

	test('never throws and reports the failure', async () => {
		const { executor } = await load();
		setError(new Error('db down'));
		await expect(executor.enqueueClaudeTaskIfEligible('user-1', 'task-1')).resolves.toBeUndefined();
		expect(h.captureException).toHaveBeenCalledWith(expect.any(Error), expect.anything());
	});

	test('processes the same task only once at a time', async () => {
		const { executor } = await load();
		const gate = deferred();
		h.processTask.mockReturnValue(gate.promise);
		queueResults([[{ processor: 'claude' }], [{ processor: 'claude' }]]);
		await executor.enqueueClaudeTaskIfEligible('user-1', 'task-1');
		await executor.enqueueClaudeTaskIfEligible('user-1', 'task-1');
		await settle();
		expect(h.processTask).toHaveBeenCalledTimes(1);
		gate.resolve();
	});
});

describe('concurrency', () => {
	test('runs two tasks at once and one per user', async () => {
		const { executor } = await load();
		const gates = new Map<string, ReturnType<typeof deferred>>();
		h.processTask.mockImplementation((taskId: string) => {
			const gate = deferred();
			gates.set(taskId, gate);
			return gate.promise;
		});
		queueResults(Array.from({ length: 4 }, () => [{ processor: 'claude' }]));
		await executor.enqueueClaudeTaskIfEligible('user-a', 'a1');
		await executor.enqueueClaudeTaskIfEligible('user-a', 'a2');
		await executor.enqueueClaudeTaskIfEligible('user-b', 'b1');
		await executor.enqueueClaudeTaskIfEligible('user-c', 'c1');
		await settle();
		expect([...gates.keys()]).toEqual(['a1', 'b1']);

		gates.get('a1')!.resolve();
		await settle();
		expect([...gates.keys()]).toEqual(['a1', 'b1', 'a2']);

		gates.get('b1')!.resolve();
		await settle();
		expect([...gates.keys()]).toEqual(['a1', 'b1', 'a2', 'c1']);
		gates.get('a2')!.resolve();
		gates.get('c1')!.resolve();
	});

	test('keeps going after a job fails', async () => {
		const { executor } = await load();
		h.processTask.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
		queueResults([[{ processor: 'claude' }], [{ processor: 'claude' }]]);
		await executor.enqueueClaudeTaskIfEligible('user-a', 'a1');
		await executor.enqueueClaudeTaskIfEligible('user-a', 'a2');
		await settle();
		expect(h.captureException).toHaveBeenCalledTimes(1);
		expect(h.processTask).toHaveBeenCalledTimes(2);
	});
});

describe('abortClaudeRuns', () => {
	const start = async () => {
		const { executor } = await load();
		const signals = new Map<string, AbortSignal>();
		h.processTask.mockImplementation((taskId: string, options: { signal: AbortSignal }) => {
			signals.set(taskId, options.signal);
			return new Promise(() => {});
		});
		queueResults([[{ processor: 'claude' }], [{ processor: 'claude' }]]);
		await executor.enqueueClaudeTaskIfEligible('user-a', 'a1');
		await executor.enqueueClaudeTaskIfEligible('user-b', 'b1');
		await settle();
		return { executor, signals };
	};

	test('aborts only the runs of one user', async () => {
		const { executor, signals } = await start();
		executor.abortClaudeRuns('user-a');
		expect(signals.get('a1')!.aborted).toBe(true);
		expect(signals.get('b1')!.aborted).toBe(false);
	});

	test('aborts every run without a user', async () => {
		const { executor, signals } = await start();
		executor.abortClaudeRuns();
		expect([...signals.values()].every((signal) => signal.aborted)).toBe(true);
	});
});

describe('abortClaudeRunsWhereGated', () => {
	const start = async () => {
		const { executor, errors } = await load();
		const signals = new Map<string, AbortSignal>();
		h.processTask.mockImplementation((taskId: string, options: { signal: AbortSignal }) => {
			signals.set(taskId, options.signal);
			return new Promise(() => {});
		});
		queueResults([[{ processor: 'claude' }], [{ processor: 'claude' }]]);
		await executor.enqueueClaudeTaskIfEligible('user-a', 'a1');
		await executor.enqueueClaudeTaskIfEligible('user-b', 'b1');
		await settle();
		return { executor, errors, signals };
	};

	test('aborts only owners whose gates now fail', async () => {
		const { executor, errors, signals } = await start();
		h.assertClaudeAllowed.mockImplementation(async (owner: string) => {
			if (owner === 'user-b') throw new errors.ClaudeGateError('no_access');
		});
		await executor.abortClaudeRunsWhereGated();
		expect(signals.get('a1')!.aborted).toBe(false);
		expect(signals.get('b1')!.aborted).toBe(true);
	});

	test('keeps runs alive when the gates still pass or only the processor changed', async () => {
		const { executor, errors, signals } = await start();
		await executor.abortClaudeRunsWhereGated('user-a');
		h.assertClaudeAllowed.mockRejectedValue(new errors.ClaudeProcessorChangedError());
		await executor.abortClaudeRunsWhereGated('user-b');
		expect([...signals.values()].some((signal) => signal.aborted)).toBe(false);
	});

	test('surfaces unexpected failures', async () => {
		const { executor } = await start();
		h.assertClaudeAllowed.mockRejectedValue(new Error('db down'));
		await expect(executor.abortClaudeRunsWhereGated('user-a')).rejects.toThrow('db down');
	});
});

describe('requeued runs', () => {
	test('a run that asks to be requeued is processed again', async () => {
		const { executor } = await load();
		h.processTask.mockResolvedValueOnce('requeued').mockResolvedValue(undefined);
		await executor.enqueueClaudeTaskIfEligible('user-a', 'a1');
		await settle();
		expect(h.processTask).toHaveBeenCalledTimes(2);
	});
});

describe('requeueRunForEditedTask', () => {
	test('puts a waiting run back in the queue', async () => {
		const { executor } = await load();
		reset();
		setResult([{ userId: 'user-1' }]);
		await executor.requeueRunForEditedTask('task-1');
		await settle();
		expect(h.processTask).toHaveBeenCalledWith('task-1', expect.anything());
	});

	test('ignores a task without a waiting run', async () => {
		const { executor } = await load();
		reset();
		setResult([]);
		await executor.requeueRunForEditedTask('task-1');
		await settle();
		expect(h.processTask).not.toHaveBeenCalled();
	});
});

describe('sweepClaudeTasks', () => {
	test('abandons stale reservations and enqueues candidates of users with capability', async () => {
		const { executor } = await load();
		reset();
		setResult([
			{ id: 't1', user_id: 'user-ok' },
			{ id: 't2', user_id: 'user-ok' },
			{ id: 't3', user_id: 'user-blocked' }
		]);
		h.getClaudeCapability.mockImplementation(async (userId: string) => ({
			available: userId === 'user-ok'
		}));
		await executor.sweepClaudeTasks();
		await settle();
		expect(h.abandonStaleReservations).toHaveBeenCalledTimes(1);
		expect(h.getClaudeCapability).toHaveBeenCalledTimes(2);
		expect(h.ensureRun.mock.calls.map((call) => call[1])).toEqual(['t1', 't2']);
		expect(h.processTask.mock.calls.map((call) => call[0]).sort()).toEqual(['t1', 't2']);
	});
});

describe('startClaudeWorker', () => {
	test('does nothing without a key', async () => {
		const { executor } = await load();
		h.configured.value = false;
		executor.startClaudeWorker();
		expect(h.abandonStaleReservations).not.toHaveBeenCalled();
	});

	test('sweeps immediately and then on an interval, once', async () => {
		vi.useFakeTimers();
		const { executor } = await load();
		reset();
		setResult([]);
		executor.startClaudeWorker();
		executor.startClaudeWorker();
		await vi.advanceTimersByTimeAsync(0);
		expect(h.abandonStaleReservations).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2 * 60_000);
		expect(h.abandonStaleReservations).toHaveBeenCalledTimes(2);
	});

	test('reports a failing sweep and aborts runs when access changes', async () => {
		vi.useFakeTimers();
		const { executor, events, errors } = await load();
		const signals: AbortSignal[] = [];
		h.processTask.mockImplementation((_taskId: string, options: { signal: AbortSignal }) => {
			signals.push(options.signal);
			return new Promise(() => {});
		});
		h.abandonStaleReservations.mockRejectedValueOnce(new Error('db down'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		executor.startClaudeWorker();
		await vi.advanceTimersByTimeAsync(0);
		expect(h.captureException).toHaveBeenCalledWith(expect.any(Error), expect.anything());
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();

		await executor.enqueueClaudeTaskIfEligible('user-a', 'a1');
		await vi.advanceTimersByTimeAsync(0);
		expect(signals).toHaveLength(1);
		events.emitClaudeAccessChanged({ userId: 'someone-else' });
		await vi.advanceTimersByTimeAsync(0);
		expect(signals[0]!.aborted).toBe(false);

		events.emitClaudeAccessChanged({ userId: 'user-a' });
		await vi.advanceTimersByTimeAsync(0);
		expect(signals[0]!.aborted).toBe(false);

		h.assertClaudeAllowed.mockRejectedValue(new errors.ClaudeGateError('no_access'));
		events.emitClaudeAccessChanged({});
		await vi.advanceTimersByTimeAsync(0);
		expect(signals[0]!.aborted).toBe(true);
	});
});
