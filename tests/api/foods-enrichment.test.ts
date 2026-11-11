import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';

const h = vi.hoisted(() => ({
	getStatus: vi.fn(),
	start: vi.fn(),
	cancel: vi.fn(),
	wake: vi.fn(),
	abort: vi.fn()
}));

vi.mock('$lib/server/food-enrichment/jobs', () => ({
	getEnrichmentStatus: h.getStatus,
	startEnrichmentJob: h.start,
	cancelEnrichmentJob: h.cancel
}));
vi.mock('$lib/server/food-enrichment/worker', () => ({
	wakeEnrichmentJob: h.wake,
	abortEnrichmentJob: h.abort
}));

const { GET, POST, DELETE } = await import('../../src/routes/api/foods/enrichment/+server');

const job = (overrides: Record<string, unknown> = {}) => ({
	state: 'running',
	total: 40,
	processed: 12,
	updated: 7,
	notFound: 3,
	failed: 1,
	startedAt: '2026-11-11T10:00:00.000Z',
	finishedAt: null,
	...overrides
});

beforeEach(() => {
	for (const fn of Object.values(h)) fn.mockReset();
});

describe('GET /api/foods/enrichment', () => {
	test('returns 401 when not authenticated', async () => {
		const response = await GET(createMockEvent({ user: null }));
		await expectResponseContract('GET', '/api/foods/enrichment', response);
		expect(response.status).toBe(401);
	});

	test('returns the candidates and the latest job', async () => {
		h.getStatus.mockResolvedValue({ candidates: 28, job: job() });

		const response = await GET(createMockEvent({ user: TEST_USER }));
		await expectResponseContract('GET', '/api/foods/enrichment', response);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ candidates: 28, job: job() });
		expect(h.getStatus).toHaveBeenCalledWith(TEST_USER.id);
	});

	test('job is null before the first run', async () => {
		h.getStatus.mockResolvedValue({ candidates: 3, job: null });

		const response = await GET(createMockEvent({ user: TEST_USER }));
		await expectResponseContract('GET', '/api/foods/enrichment', response);

		expect((await response.json()).job).toBeNull();
	});
});

describe('POST /api/foods/enrichment', () => {
	test('returns 401 when not authenticated', async () => {
		const response = await POST(createMockEvent({ user: null, method: 'POST' }));
		await expectResponseContract('POST', '/api/foods/enrichment', response);
		expect(response.status).toBe(401);
		expect(h.start).not.toHaveBeenCalled();
	});

	test('queues a run and wakes the worker', async () => {
		const queued = job({ state: 'queued', processed: 0, updated: 0, notFound: 0, failed: 0 });
		h.start.mockResolvedValue({ status: { candidates: 40, job: queued }, queued: true });

		const response = await POST(createMockEvent({ user: TEST_USER, method: 'POST' }));
		await expectResponseContract('POST', '/api/foods/enrichment', response);

		expect(response.status).toBe(202);
		expect((await response.json()).job.state).toBe('queued');
		expect(h.wake).toHaveBeenCalledWith(TEST_USER.id);
	});

	test('returns the active run without waking a second one', async () => {
		h.start.mockResolvedValue({ status: { candidates: 28, job: job() }, queued: false });

		const response = await POST(createMockEvent({ user: TEST_USER, method: 'POST' }));
		await expectResponseContract('POST', '/api/foods/enrichment', response);

		expect(response.status).toBe(202);
		expect((await response.json()).job.state).toBe('running');
		expect(h.wake).not.toHaveBeenCalled();
	});
});

describe('DELETE /api/foods/enrichment', () => {
	test('returns 401 when not authenticated', async () => {
		const response = await DELETE(createMockEvent({ user: null, method: 'DELETE' }));
		await expectResponseContract('DELETE', '/api/foods/enrichment', response);
		expect(response.status).toBe(401);
	});

	test('cancels the run and stops this instance from waiting on it', async () => {
		const cancelled = job({ state: 'cancelled', finishedAt: '2026-11-11T10:02:00.000Z' });
		h.cancel.mockResolvedValue({ candidates: 28, job: cancelled });

		const response = await DELETE(createMockEvent({ user: TEST_USER, method: 'DELETE' }));
		await expectResponseContract('DELETE', '/api/foods/enrichment', response);

		expect(response.status).toBe(200);
		expect((await response.json()).job.state).toBe('cancelled');
		expect(h.cancel).toHaveBeenCalledWith(TEST_USER.id);
		expect(h.abort).toHaveBeenCalledWith(TEST_USER.id);
	});
});
