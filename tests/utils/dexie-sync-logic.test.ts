/**
 * Tests for the sync queue processing logic.
 *
 * Since sync.ts imports SvelteKit-specific modules ($app/environment,
 * sync-state.svelte), we test the core logic patterns directly against Dexie
 * rather than importing the module.
 */
import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { db } from '../../src/lib/db/index';

const MAX_RETRIES = 3;

type QueueItem = {
	id?: number;
	method: string;
	url: string;
	body: string;
	createdAt: number;
	affectedTable?: string;
	affectedId?: string;
};

/**
 * Minimal reproduction of the sync queue processing logic from sync.ts.
 * Tests the HTTP status code handling and retry behavior.
 */
async function processSyncQueue(
	fetchFn: (url: string, init: RequestInit) => Promise<Response>,
	retryCounts: Map<number, number>
): Promise<{ synced: number; errors: string[]; stopped: boolean }> {
	const queued = await db.syncQueue.orderBy('createdAt').toArray();
	let synced = 0;
	const errors: string[] = [];
	let stopped = false;

	for (const req of queued as QueueItem[]) {
		try {
			const response = await fetchFn(req.url, {
				method: req.method,
				headers: { 'content-type': 'application/json' },
				body: req.method !== 'DELETE' ? req.body : undefined
			});

			if (response.ok) {
				await db.syncQueue.delete(req.id!);
				retryCounts.delete(req.id!);
				synced++;
			} else if (response.status === 401 || response.status === 403) {
				errors.push('Session expired.');
				stopped = true;
				break;
			} else if (response.status >= 400 && response.status < 500) {
				await db.syncQueue.delete(req.id!);
				retryCounts.delete(req.id!);
				synced++;
				errors.push(`Client error: HTTP ${response.status}`);
			} else {
				// 5xx — track retries
				const count = (retryCounts.get(req.id!) ?? 0) + 1;
				retryCounts.set(req.id!, count);

				if (count >= MAX_RETRIES) {
					await db.syncQueue.delete(req.id!);
					retryCounts.delete(req.id!);
					synced++;
					errors.push(`Gave up after ${MAX_RETRIES} retries.`);
				} else {
					stopped = true;
					break;
				}
			}
		} catch {
			stopped = true;
			break;
		}
	}

	return { synced, errors, stopped };
}

beforeEach(async () => {
	await Promise.all(db.tables.map((t) => t.clear()));
});

describe('sync queue HTTP status handling', () => {
	test('200 OK removes item from queue', async () => {
		await db.syncQueue.add({
			method: 'POST', url: '/api/foods', body: '{"name":"Apple"}', createdAt: 1000
		});

		const fetchFn = mock(() =>
			Promise.resolve(new Response('{}', { status: 200 }))
		);

		const result = await processSyncQueue(fetchFn, new Map());

		expect(result.synced).toBe(1);
		expect(result.errors).toHaveLength(0);
		expect(await db.syncQueue.count()).toBe(0);
	});

	test('401 stops syncing and keeps items in queue', async () => {
		await db.syncQueue.add({
			method: 'POST', url: '/api/foods', body: '{}', createdAt: 1000
		});
		await db.syncQueue.add({
			method: 'POST', url: '/api/entries', body: '{}', createdAt: 2000
		});

		const fetchFn = mock(() =>
			Promise.resolve(new Response('{}', { status: 401 }))
		);

		const result = await processSyncQueue(fetchFn, new Map());

		expect(result.synced).toBe(0);
		expect(result.stopped).toBe(true);
		expect(result.errors[0]).toContain('Session expired');
		// Both items still in queue
		expect(await db.syncQueue.count()).toBe(2);
		// Only first item was attempted
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	test('403 stops syncing and keeps items in queue', async () => {
		await db.syncQueue.add({
			method: 'POST', url: '/api/foods', body: '{}', createdAt: 1000
		});

		const fetchFn = mock(() =>
			Promise.resolve(new Response('{}', { status: 403 }))
		);

		const result = await processSyncQueue(fetchFn, new Map());

		expect(result.synced).toBe(0);
		expect(result.stopped).toBe(true);
		expect(await db.syncQueue.count()).toBe(1);
	});

	test('4xx client error removes item from queue (unrecoverable)', async () => {
		await db.syncQueue.add({
			method: 'POST', url: '/api/foods', body: '{}', createdAt: 1000
		});

		const fetchFn = mock(() =>
			Promise.resolve(new Response('{}', { status: 422 }))
		);

		const result = await processSyncQueue(fetchFn, new Map());

		expect(result.synced).toBe(1);
		expect(result.errors[0]).toContain('Client error');
		expect(await db.syncQueue.count()).toBe(0);
	});

	test('404 removes item from queue', async () => {
		await db.syncQueue.add({
			method: 'DELETE', url: '/api/foods/f1', body: '{}', createdAt: 1000
		});

		const fetchFn = mock(() =>
			Promise.resolve(new Response('{}', { status: 404 }))
		);

		const result = await processSyncQueue(fetchFn, new Map());

		expect(result.synced).toBe(1);
		expect(await db.syncQueue.count()).toBe(0);
	});

	test('5xx stops syncing on first occurrence', async () => {
		await db.syncQueue.add({
			method: 'POST', url: '/api/foods', body: '{}', createdAt: 1000
		});
		await db.syncQueue.add({
			method: 'POST', url: '/api/entries', body: '{}', createdAt: 2000
		});

		const fetchFn = mock(() =>
			Promise.resolve(new Response('{}', { status: 500 }))
		);
		const retryCounts = new Map<number, number>();

		const result = await processSyncQueue(fetchFn, retryCounts);

		expect(result.synced).toBe(0);
		expect(result.stopped).toBe(true);
		// Item still in queue
		expect(await db.syncQueue.count()).toBe(2);
		// Retry count incremented
		expect(retryCounts.size).toBe(1);
		expect([...retryCounts.values()][0]).toBe(1);
	});

	test('5xx discards item after MAX_RETRIES attempts', async () => {
		const id = await db.syncQueue.add({
			method: 'POST', url: '/api/foods', body: '{}', createdAt: 1000
		});

		const fetchFn = mock(() =>
			Promise.resolve(new Response('{}', { status: 500 }))
		);

		// Simulate already having retried MAX_RETRIES - 1 times
		const retryCounts = new Map<number, number>();
		retryCounts.set(id as number, MAX_RETRIES - 1);

		const result = await processSyncQueue(fetchFn, retryCounts);

		expect(result.synced).toBe(1);
		expect(result.errors[0]).toContain(`${MAX_RETRIES} retries`);
		expect(await db.syncQueue.count()).toBe(0);
		// Retry count cleaned up
		expect(retryCounts.size).toBe(0);
	});

	test('network error stops syncing and keeps items', async () => {
		await db.syncQueue.add({
			method: 'POST', url: '/api/foods', body: '{}', createdAt: 1000
		});

		const fetchFn = mock(() => Promise.reject(new Error('Network failure')));

		const result = await processSyncQueue(fetchFn, new Map());

		expect(result.synced).toBe(0);
		expect(result.stopped).toBe(true);
		expect(await db.syncQueue.count()).toBe(1);
	});

	test('processes multiple items in order — success then 401 stops', async () => {
		await db.syncQueue.add({
			method: 'POST', url: '/api/foods', body: '{}', createdAt: 1000
		});
		await db.syncQueue.add({
			method: 'POST', url: '/api/entries', body: '{}', createdAt: 2000
		});
		await db.syncQueue.add({
			method: 'DELETE', url: '/api/entries/e1', body: '{}', createdAt: 3000
		});

		let callCount = 0;
		const fetchFn = mock(() => {
			callCount++;
			if (callCount === 1) return Promise.resolve(new Response('{}', { status: 200 }));
			return Promise.resolve(new Response('{}', { status: 401 }));
		});

		const result = await processSyncQueue(fetchFn, new Map());

		expect(result.synced).toBe(1);
		expect(result.stopped).toBe(true);
		// First item removed, second and third remain
		expect(await db.syncQueue.count()).toBe(2);
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	test('mixed statuses: 200, 422, 200 processes all', async () => {
		await db.syncQueue.add({
			method: 'POST', url: '/api/foods', body: '{}', createdAt: 1000
		});
		await db.syncQueue.add({
			method: 'PATCH', url: '/api/foods/f1', body: '{}', createdAt: 2000
		});
		await db.syncQueue.add({
			method: 'POST', url: '/api/entries', body: '{}', createdAt: 3000
		});

		let callCount = 0;
		const fetchFn = mock(() => {
			callCount++;
			if (callCount === 2) return Promise.resolve(new Response('{}', { status: 422 }));
			return Promise.resolve(new Response('{}', { status: 200 }));
		});

		const result = await processSyncQueue(fetchFn, new Map());

		expect(result.synced).toBe(3);
		expect(result.errors).toHaveLength(1);
		expect(await db.syncQueue.count()).toBe(0);
	});

	test('DELETE request does not send body', async () => {
		await db.syncQueue.add({
			method: 'DELETE', url: '/api/foods/f1', body: '{}', createdAt: 1000
		});

		const fetchFn = mock((_url: string, init: RequestInit) => {
			expect(init.body).toBeUndefined();
			return Promise.resolve(new Response('{}', { status: 200 }));
		});

		await processSyncQueue(fetchFn, new Map());
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});
});
