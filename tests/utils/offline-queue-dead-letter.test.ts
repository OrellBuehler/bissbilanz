import { describe, expect, test, beforeEach } from 'vitest';
import { db } from '$lib/db';
import {
	enqueue,
	drainQueue,
	markFailed,
	listFailed,
	retryFailed,
	discardFailed,
	countFailed
} from '$lib/stores/offline-queue';

describe('offline queue dead-letter', () => {
	beforeEach(async () => {
		await db.syncQueue.clear();
	});

	test('markFailed parks the item: excluded from drainQueue, counted as failed', async () => {
		await enqueue('POST', '/api/entries', { a: 1 });
		const [item] = await drainQueue();
		await markFailed(item.id!, 'HTTP 500');
		expect(await drainQueue()).toHaveLength(0);
		expect(await countFailed()).toBe(1);
		const [failed] = await listFailed();
		expect(failed.failureReason).toBe('HTTP 500');
	});

	test('retryFailed returns parked items to the active queue', async () => {
		await enqueue('POST', '/api/entries', { a: 1 });
		const [item] = await drainQueue();
		await markFailed(item.id!, 'HTTP 500');
		await retryFailed();
		expect(await drainQueue()).toHaveLength(1);
		expect(await countFailed()).toBe(0);
	});

	test('discardFailed deletes only parked items', async () => {
		await enqueue('POST', '/api/entries', { a: 1 });
		await enqueue('POST', '/api/foods', { b: 2 });
		const [first] = await drainQueue();
		await markFailed(first.id!, 'HTTP 422');
		await discardFailed();
		expect(await db.syncQueue.count()).toBe(1);
		expect(await countFailed()).toBe(0);
	});
});
