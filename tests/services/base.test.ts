import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('$lib/stores/offline-queue', () => ({
	enqueue: vi.fn(),
	pendingIdsFor: vi.fn(async () => new Set<string>())
}));

import { withOfflineFallback } from '../../src/lib/services/base';
import { apiFetch } from '../../src/lib/utils/api';
import { enqueue } from '$lib/stores/offline-queue';

const mockEnqueue = enqueue as ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
});

describe('withOfflineFallback', () => {
	test('calls onSuccess with data when the response is ok and not queued', async () => {
		const onSuccess = vi.fn();
		await withOfflineFallback(
			async () => ({ data: { id: '1' }, response: new Response(null, { status: 200 }) }),
			{ method: 'POST', url: '/api/x', body: {}, affectedTable: 'x', onSuccess }
		);

		expect(onSuccess).toHaveBeenCalledWith({ id: '1' });
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	test('still calls onSuccess for a 204 no-content success response', async () => {
		const onSuccess = vi.fn();
		await withOfflineFallback(
			async () => ({ data: undefined, response: new Response(null, { status: 204 }) }),
			{
				method: 'DELETE',
				url: '/api/x/1',
				body: {},
				affectedTable: 'x',
				affectedId: '1',
				onSuccess
			}
		);

		expect(onSuccess).toHaveBeenCalledWith(undefined);
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	test('skips onSuccess when the response is a queued (offline) placeholder', async () => {
		const onSuccess = vi.fn();
		const queuedResponse = new Response(JSON.stringify({ queued: true }), {
			status: 200,
			headers: { 'x-queued': 'true' }
		});
		await withOfflineFallback(async () => ({ data: { queued: true }, response: queuedResponse }), {
			method: 'POST',
			url: '/api/x',
			body: {},
			affectedTable: 'x',
			onSuccess
		});

		expect(onSuccess).not.toHaveBeenCalled();
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	test('skips onSuccess for a non-ok error response without enqueueing', async () => {
		const onSuccess = vi.fn();
		await withOfflineFallback(
			async () => ({ data: undefined, response: new Response(null, { status: 400 }) }),
			{ method: 'POST', url: '/api/x', body: {}, affectedTable: 'x', onSuccess }
		);

		expect(onSuccess).not.toHaveBeenCalled();
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	test('enqueues exactly once when the request fails to reach the server', async () => {
		const onSuccess = vi.fn();
		const err = Object.assign(new TypeError('Failed to fetch'), {
			sentWrite: { idempotencyKey: 'key-1', clientEditedAt: '2026-01-01T00:00:00.000Z' }
		});
		await withOfflineFallback(
			async () => {
				throw err;
			},
			{
				method: 'POST',
				url: '/api/x',
				body: { a: 1 },
				affectedTable: 'x',
				affectedId: '1',
				onSuccess
			}
		);

		expect(onSuccess).not.toHaveBeenCalled();
		expect(mockEnqueue).toHaveBeenCalledTimes(1);
		expect(mockEnqueue).toHaveBeenCalledWith(
			'POST',
			'/api/x',
			{ a: 1 },
			{
				affectedTable: 'x',
				affectedId: '1',
				idempotencyKey: 'key-1',
				clientEditedAt: '2026-01-01T00:00:00.000Z'
			}
		);
	});

	test('does not enqueue when the error did not come from a failed request', async () => {
		const result = await withOfflineFallback(
			async () => {
				throw new SyntaxError('Unexpected end of JSON input');
			},
			{ method: 'POST', url: '/api/x', body: {}, affectedTable: 'x' }
		);

		expect(result.status).toBe('error');
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	test('a failing onSuccess neither enqueues a replay nor changes the applied result', async () => {
		const onSuccess = vi.fn().mockRejectedValue(new Error('dexie write failed'));
		const result = await withOfflineFallback(
			async () => ({ data: { id: '1' }, response: new Response(null, { status: 201 }) }),
			{ method: 'POST', url: '/api/x', body: {}, affectedTable: 'x', onSuccess }
		);

		expect(result.status).toBe('applied');
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	test('queues the replay under the idempotency key the failed online request used', async () => {
		vi.stubGlobal('navigator', { onLine: true });
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockRejectedValueOnce(new TypeError('Failed to fetch'));

		await withOfflineFallback(
			() => apiFetch('/api/entries', { method: 'POST', body: '{}' }) as never,
			{
				method: 'POST',
				url: '/api/entries',
				body: {},
				affectedTable: 'foodEntries'
			}
		);

		const sent = new Headers((fetchSpy.mock.calls[0][1] as RequestInit).headers);
		const meta = mockEnqueue.mock.calls[0][3];
		expect(sent.get('idempotency-key')).toBeTruthy();
		expect(meta.idempotencyKey).toBe(sent.get('idempotency-key'));
		expect(meta.clientEditedAt).toBe(sent.get('x-client-edited-at'));
		vi.unstubAllGlobals();
		fetchSpy.mockRestore();
	});
});
