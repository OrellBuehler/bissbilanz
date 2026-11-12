import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
	delay: vi.fn(),
	next: vi.fn(),
	applyLookup: vi.fn(),
	lookupBarcode: vi.fn(),
	claim: vi.fn(),
	finish: vi.fn(),
	list: vi.fn(),
	record: vi.fn(),
	release: vi.fn(),
	renew: vi.fn(),
	captureException: vi.fn(),
	captureMessage: vi.fn(),
	addBreadcrumb: vi.fn()
}));

vi.mock('node:timers/promises', () => ({ setTimeout: h.delay }));
vi.mock('@sentry/sveltekit', () => ({
	captureException: h.captureException,
	captureMessage: h.captureMessage,
	addBreadcrumb: h.addBreadcrumb
}));
vi.mock('$lib/server/food-enrichment/candidates', () => ({ nextEnrichmentCandidates: h.next }));
vi.mock('$lib/server/food-enrichment/enrich', () => ({
	applyLookup: h.applyLookup,
	lookupBarcode: h.lookupBarcode
}));
vi.mock('$lib/server/food-enrichment/jobs', () => ({
	claimEnrichmentJob: h.claim,
	finishEnrichmentJob: h.finish,
	listResumableEnrichmentJobs: h.list,
	recordEnrichmentProgress: h.record,
	releaseEnrichmentLease: h.release,
	renewEnrichmentLease: h.renew
}));

const load = async () => {
	vi.resetModules();
	return import('$lib/server/food-enrichment/worker');
};

const unavailable = (retryAfterSeconds: number | null = null) => ({
	status: 'unavailable',
	httpStatus: retryAfterSeconds === null ? 503 : 429,
	retryAfterSeconds,
	error: null
});

const product = { name: 'Oats' };

const foodsInOrder = (...ids: string[]) => ids.map((id) => ({ id, barcode: `40000000000${id}` }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

const sleeps = () => h.delay.mock.calls.map(([ms]) => ms as number);

const signal = () => new AbortController().signal;

beforeEach(() => {
	for (const fn of Object.values(h)) fn.mockReset();
	h.delay.mockResolvedValue(undefined);
	h.claim.mockResolvedValue({ userId: 'user-1', cursor: null });
	h.next.mockResolvedValueOnce(foodsInOrder('01', '02')).mockResolvedValue([]);
	h.lookupBarcode.mockResolvedValue({ status: 'found', product });
	h.applyLookup.mockResolvedValue({ status: 'updated', food: {} });
	h.renew.mockResolvedValue(true);
	h.record.mockResolvedValue('running');
	h.finish.mockResolvedValue(undefined);
	h.release.mockResolvedValue(undefined);
	h.list.mockResolvedValue([]);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('backoffMs', () => {
	test('grows exponentially, honours Retry-After and is capped', async () => {
		const { backoffMs } = await load();
		expect([1, 2, 3].map((attempt) => backoffMs(attempt, null))).toEqual([5000, 15000, 45000]);
		expect(backoffMs(1, 30)).toBe(30000);
		expect(backoffMs(1, 0)).toBe(5000);
		expect(backoffMs(3, 1)).toBe(5000);
		expect(backoffMs(9, null)).toBe(120000);
		expect(backoffMs(1, 3600)).toBe(120000);
	});
});

describe('runEnrichmentJob', () => {
	test('works through the candidates and completes', async () => {
		const worker = await load();
		h.applyLookup
			.mockResolvedValueOnce({ status: 'updated', food: {} })
			.mockResolvedValueOnce({ status: 'not_found', food: {} });

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.next).toHaveBeenNthCalledWith(1, 'user-1', null, 25);
		expect(h.next).toHaveBeenNthCalledWith(2, 'user-1', '02', 25);
		expect(h.record.mock.calls.map((call) => call.slice(2))).toEqual([
			['01', 'updated'],
			['02', 'not_found']
		]);
		expect(h.finish).toHaveBeenCalledWith('user-1', expect.any(String), 'completed');
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('waits at least a second between Open Food Facts requests', async () => {
		const worker = await load();
		await worker.runEnrichmentJob('user-1', signal());

		expect(h.lookupBarcode).toHaveBeenCalledTimes(2);
		expect(sleeps()).toHaveLength(1);
		expect(sleeps()[0]).toBeGreaterThan(900);
		expect(sleeps()[0]).toBeLessThanOrEqual(1000);
	});

	test('a definite not found is applied, so the marker gets stamped', async () => {
		const worker = await load();
		h.lookupBarcode.mockResolvedValue({ status: 'not_found' });
		h.applyLookup.mockResolvedValue({ status: 'not_found', food: {} });

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.applyLookup).toHaveBeenCalledWith('user-1', '01', '4000000000001', {
			status: 'not_found'
		});
		expect(h.record.mock.calls.map((call) => call[3])).toEqual(['not_found', 'not_found']);
	});

	test('a transient failure is retried with backoff, then counted without stamping', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next.mockResolvedValueOnce(foodsInOrder('01')).mockResolvedValue([]);
		h.lookupBarcode.mockResolvedValue(unavailable());

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.lookupBarcode).toHaveBeenCalledTimes(4);
		expect(h.applyLookup).not.toHaveBeenCalled();
		expect(h.record).toHaveBeenCalledWith('user-1', expect.any(String), '01', 'failed');
		const waits = sleeps();
		expect(waits).toHaveLength(3);
		expect(waits[0]).toBeGreaterThan(4900);
		expect(waits[1]).toBeGreaterThan(14900);
		expect(waits[2]).toBeGreaterThan(44900);
		expect(h.addBreadcrumb).toHaveBeenCalledTimes(4);
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('retries after Retry-After and then applies the answer', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next.mockResolvedValueOnce(foodsInOrder('01')).mockResolvedValue([]);
		h.lookupBarcode
			.mockResolvedValueOnce(unavailable(30))
			.mockResolvedValueOnce({ status: 'found', product });

		await worker.runEnrichmentJob('user-1', signal());

		expect(sleeps()[0]).toBeGreaterThan(29900);
		expect(h.record).toHaveBeenCalledWith('user-1', expect.any(String), '01', 'updated');
	});

	test('a 429 on the last attempt still pushes back the next request', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next.mockResolvedValueOnce(foodsInOrder('01', '02')).mockResolvedValue([]);
		h.lookupBarcode
			.mockResolvedValueOnce(unavailable())
			.mockResolvedValueOnce(unavailable())
			.mockResolvedValueOnce(unavailable())
			.mockResolvedValueOnce(unavailable(90))
			.mockResolvedValueOnce({ status: 'not_found' });
		h.applyLookup.mockResolvedValue({ status: 'not_found', food: {} });

		await worker.runEnrichmentJob('user-1', signal());

		const waits = sleeps();
		expect(waits).toHaveLength(4);
		expect(waits[3]).toBeGreaterThan(89_900);
		expect(h.record.mock.calls.map((call) => call[3])).toEqual(['failed', 'not_found']);
	});

	test('a food deleted during the lookup counts as skipped', async () => {
		const worker = await load();
		h.applyLookup.mockResolvedValue({ status: 'gone' });

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.record.mock.calls.map((call) => call[3])).toEqual(['skipped', 'skipped']);
	});

	test('resumes from the stored cursor', async () => {
		const worker = await load();
		h.claim.mockResolvedValue({ userId: 'user-1', cursor: '07' });

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.next).toHaveBeenNthCalledWith(1, 'user-1', '07', 25);
	});

	test('does nothing when the job cannot be claimed', async () => {
		const worker = await load();
		h.claim.mockResolvedValue(undefined);

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.next).not.toHaveBeenCalled();
	});

	test('a cancel stops between items and releases the lease', async () => {
		const worker = await load();
		h.record.mockResolvedValueOnce('cancelled');

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.lookupBarcode).toHaveBeenCalledTimes(1);
		expect(h.release).toHaveBeenCalledTimes(1);
		expect(h.finish).not.toHaveBeenCalled();
	});

	test('stops before the request when the lease is gone', async () => {
		const worker = await load();
		h.renew.mockResolvedValue(false);

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.lookupBarcode).not.toHaveBeenCalled();
		expect(h.record).not.toHaveBeenCalled();
		expect(h.release).toHaveBeenCalledTimes(1);
	});

	test('stops quietly when the progress write finds the lease taken over', async () => {
		const worker = await load();
		h.record.mockResolvedValueOnce(null);

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.lookupBarcode).toHaveBeenCalledTimes(1);
		expect(h.release).not.toHaveBeenCalled();
		expect(h.finish).not.toHaveBeenCalled();
	});

	test('an abort interrupts the wait for the next request', async () => {
		const worker = await load();
		const controller = new AbortController();
		h.delay.mockImplementation(
			(_ms: number, _value: unknown, options: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					options.signal.addEventListener('abort', () => reject(options.signal.reason));
				})
		);

		const run = worker.runEnrichmentJob('user-1', controller.signal);
		await settle();
		controller.abort();
		await run;

		expect(h.lookupBarcode).toHaveBeenCalledTimes(1);
		expect(h.release).toHaveBeenCalledTimes(1);
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('a failing sleep that is not an abort surfaces', async () => {
		const worker = await load();
		h.delay.mockRejectedValue(new Error('timer broke'));

		await expect(worker.runEnrichmentJob('user-1', signal())).rejects.toThrow('timer broke');
	});

	test('an already aborted signal stops before the first request', async () => {
		const worker = await load();
		const controller = new AbortController();
		controller.abort();

		await worker.runEnrichmentJob('user-1', controller.signal);

		expect(h.lookupBarcode).not.toHaveBeenCalled();
	});

	test('an unexpected error on one food is reported and the run goes on', async () => {
		const worker = await load();
		h.applyLookup
			.mockRejectedValueOnce(new Error('bug'))
			.mockResolvedValueOnce({ status: 'unchanged', food: {} });

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.captureException).toHaveBeenCalledTimes(1);
		expect(h.record.mock.calls.map((call) => call[3])).toEqual(['failed', 'unchanged']);
		expect(h.finish).toHaveBeenCalledWith('user-1', expect.any(String), 'completed');
	});

	test('gives up after five failures in a row', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next.mockResolvedValue(foodsInOrder('01', '02', '03', '04', '05', '06'));
		h.lookupBarcode.mockResolvedValue({ status: 'not_found' });
		h.applyLookup.mockRejectedValue(new Error('db down'));

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.record).toHaveBeenCalledTimes(5);
		expect(h.finish).toHaveBeenCalledWith('user-1', expect.any(String), 'failed');
		expect(h.captureMessage).toHaveBeenCalledTimes(1);
		expect(h.captureMessage).toHaveBeenCalledWith('Food enrichment run failed', {
			level: 'warning',
			tags: { job: 'food-enrichment' },
			extra: {
				consecutiveFailures: 5,
				foodId: '05',
				reason: 'error',
				error: 'Error: db down'
			}
		});
	});

	test('a run failing on Open Food Facts reports the lookup error', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next.mockResolvedValue(foodsInOrder('01', '02', '03', '04', '05'));
		const timeout = new DOMException('The operation timed out.', 'TimeoutError');
		h.lookupBarcode.mockResolvedValue({
			status: 'unavailable',
			httpStatus: null,
			retryAfterSeconds: null,
			error: timeout
		});

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.finish).toHaveBeenCalledWith('user-1', expect.any(String), 'failed');
		expect(h.captureMessage).toHaveBeenCalledWith(
			'Food enrichment run failed',
			expect.objectContaining({
				extra: expect.objectContaining({
					reason: 'off_unavailable',
					httpStatus: null,
					error: 'TimeoutError: The operation timed out.'
				})
			})
		);
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('an unreadable product is counted as failed, not stamped and not retried', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next.mockResolvedValueOnce(foodsInOrder('01')).mockResolvedValue([]);
		h.lookupBarcode.mockResolvedValue({ status: 'invalid', issues: ['(root): invalid_type'] });

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.lookupBarcode).toHaveBeenCalledTimes(1);
		expect(h.applyLookup).not.toHaveBeenCalled();
		expect(h.record).toHaveBeenCalledWith('user-1', expect.any(String), '01', 'failed');
		expect(h.finish).toHaveBeenCalledWith('user-1', expect.any(String), 'completed');
	});

	test('the reason of a run stopped by unreadable products is reported', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next.mockResolvedValue(foodsInOrder('01', '02', '03', '04', '05'));
		h.lookupBarcode.mockResolvedValue({ status: 'invalid', issues: ['(root): invalid_type'] });

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.captureMessage).toHaveBeenCalledWith(
			'Food enrichment run failed',
			expect.objectContaining({
				extra: expect.objectContaining({
					reason: 'off_invalid_response',
					issues: ['(root): invalid_type']
				})
			})
		);
	});

	test('an aborted wait gives its request slot back', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next.mockResolvedValueOnce(foodsInOrder('01', '02')).mockResolvedValue([]);
		const first = new AbortController();
		h.delay.mockImplementation(
			(_ms: number, _value: unknown, options: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					options.signal.addEventListener('abort', () => reject(options.signal.reason));
				})
		);
		const run = worker.runEnrichmentJob('user-1', first.signal);
		await settle();
		first.abort();
		await run;

		h.delay.mockReset();
		h.delay.mockResolvedValue(undefined);
		h.next.mockReset();
		h.next.mockResolvedValueOnce(foodsInOrder('03')).mockResolvedValue([]);
		await worker.runEnrichmentJob('user-1', signal());

		const waits = sleeps();
		expect(waits.length).toBeLessThanOrEqual(1);
		expect(waits[0] ?? 0).toBeLessThanOrEqual(1000);
	});

	test('a success resets the failure streak', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next
			.mockResolvedValueOnce(foodsInOrder('01', '02', '03', '04', '05', '06', '07'))
			.mockResolvedValue([]);
		h.lookupBarcode.mockResolvedValue({ status: 'not_found' });
		h.applyLookup
			.mockRejectedValueOnce(new Error('x'))
			.mockRejectedValueOnce(new Error('x'))
			.mockRejectedValueOnce(new Error('x'))
			.mockRejectedValueOnce(new Error('x'))
			.mockResolvedValueOnce({ status: 'not_found', food: {} })
			.mockRejectedValueOnce(new Error('x'))
			.mockResolvedValueOnce({ status: 'not_found', food: {} });

		await worker.runEnrichmentJob('user-1', signal());

		expect(h.finish).toHaveBeenCalledWith('user-1', expect.any(String), 'completed');
	});
});

describe('queue', () => {
	test('a woken job runs and a failure marks it failed', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next.mockRejectedValue(new Error('db down'));

		worker.wakeEnrichmentJob('user-1');
		await settle();

		expect(h.captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { job: 'food-enrichment' }
		});
		expect(h.finish).toHaveBeenCalledWith('user-1', expect.any(String), 'failed');
	});

	test('a failure to mark the job failed is reported too', async () => {
		const worker = await load();
		h.next.mockReset();
		h.next.mockRejectedValue(new Error('db down'));
		h.finish.mockRejectedValue(new Error('still down'));

		worker.wakeEnrichmentJob('user-1');
		await settle();

		expect(h.captureException).toHaveBeenCalledTimes(2);
	});

	test('runs two users at a time, one job per user, and queues one rerun per user', async () => {
		const worker = await load();
		const gates: Array<() => void> = [];
		h.claim.mockImplementation(
			() =>
				new Promise((resolve) => {
					gates.push(() => resolve(undefined));
				})
		);
		const claimed = () => h.claim.mock.calls.map((call) => call[0]);

		worker.wakeEnrichmentJob('user-a');
		worker.wakeEnrichmentJob('user-a');
		worker.wakeEnrichmentJob('user-a');
		worker.wakeEnrichmentJob('user-b');
		worker.wakeEnrichmentJob('user-c');
		await settle();
		expect(claimed()).toEqual(['user-a', 'user-b']);

		gates[0]();
		await settle();
		expect(claimed()).toEqual(['user-a', 'user-b', 'user-a']);

		gates[1]();
		await settle();
		expect(claimed()).toEqual(['user-a', 'user-b', 'user-a', 'user-c']);

		gates[2]();
		gates[3]();
		await settle();
		expect(h.claim).toHaveBeenCalledTimes(4);
	});

	test('abortEnrichmentJob stops the running job of that user', async () => {
		const worker = await load();
		h.delay.mockImplementation(
			(_ms: number, _value: unknown, options: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					options.signal.addEventListener('abort', () => reject(options.signal.reason));
				})
		);

		worker.wakeEnrichmentJob('user-1');
		await settle();
		worker.abortEnrichmentJob('user-2');
		worker.abortEnrichmentJob('user-1');
		await settle();

		expect(h.lookupBarcode).toHaveBeenCalledTimes(1);
		expect(h.release).toHaveBeenCalledTimes(1);
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('the sweep wakes resumable jobs', async () => {
		const worker = await load();
		h.claim.mockResolvedValue(undefined);
		h.list.mockResolvedValue(['user-1', 'user-2']);

		await worker.sweepEnrichmentJobs();
		await settle();

		expect(h.claim.mock.calls.map((call) => call[0])).toEqual(['user-1', 'user-2']);
	});

	test('the worker starts once, sweeps on start and reports sweep errors', async () => {
		vi.useFakeTimers();
		const worker = await load();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		h.list.mockRejectedValue(new Error('db down'));

		worker.startFoodEnrichmentWorker();
		worker.startFoodEnrichmentWorker();
		await vi.advanceTimersByTimeAsync(0);

		expect(h.list).toHaveBeenCalledTimes(1);
		expect(h.captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { job: 'food-enrichment-sweep' }
		});

		await vi.advanceTimersByTimeAsync(2 * 60_000);
		expect(h.list).toHaveBeenCalledTimes(2);
		consoleError.mockRestore();
	});
});
