import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('$lib/stores/offline-queue', () => ({
	enqueue: vi.fn(),
	pendingIdsFor: vi.fn(async () => new Set<string>())
}));

import { withOfflineFallback } from '../../src/lib/services/base';
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

	test('enqueues exactly once when the apiCall throws', async () => {
		const onSuccess = vi.fn();
		await withOfflineFallback(
			async () => {
				throw new Error('network down');
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
				affectedId: '1'
			}
		);
	});
});
