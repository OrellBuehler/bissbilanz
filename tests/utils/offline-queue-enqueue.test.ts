import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { db } from '../../src/lib/db/index';
import {
	enqueue,
	drainQueue,
	removeFromQueue,
	clearQueue
} from '../../src/lib/stores/offline-queue';

beforeEach(async () => {
	await Promise.all(db.tables.map((t) => t.clear()));
});

describe('enqueue', () => {
	test('stores method, url, and serialized body', async () => {
		await enqueue('POST', '/api/foods', { name: 'Apple' });

		const items = await db.syncQueue.toArray();
		expect(items).toHaveLength(1);
		expect(items[0].method).toBe('POST');
		expect(items[0].url).toBe('/api/foods');
		expect(items[0].body).toBe(JSON.stringify({ name: 'Apple' }));
	});

	test('sets createdAt timestamp', async () => {
		const before = Date.now();
		await enqueue('POST', '/api/foods', { name: 'Apple' });
		const after = Date.now();

		const items = await db.syncQueue.toArray();
		expect(items[0].createdAt).toBeGreaterThanOrEqual(before);
		expect(items[0].createdAt).toBeLessThanOrEqual(after);
	});

	test('stores metadata when provided', async () => {
		await enqueue(
			'POST',
			'/api/foods',
			{ name: 'Apple' },
			{
				affectedTable: 'foods',
				affectedId: 'f1'
			}
		);

		const items = await db.syncQueue.toArray();
		expect(items[0].affectedTable).toBe('foods');
		expect(items[0].affectedId).toBe('f1');
	});

	test('stores undefined metadata fields when meta is omitted', async () => {
		await enqueue('POST', '/api/foods', { name: 'Apple' });

		const items = await db.syncQueue.toArray();
		expect(items[0].affectedTable).toBeUndefined();
		expect(items[0].affectedId).toBeUndefined();
	});

	test('stores partial metadata', async () => {
		await enqueue(
			'POST',
			'/api/foods',
			{ name: 'Apple' },
			{
				affectedTable: 'foods'
			}
		);

		const items = await db.syncQueue.toArray();
		expect(items[0].affectedTable).toBe('foods');
		expect(items[0].affectedId).toBeUndefined();
	});

	test('serializes complex body objects', async () => {
		const body = {
			name: 'Oatmeal',
			ingredients: [{ foodId: 'f1', quantity: 50 }],
			totalServings: 2
		};
		await enqueue('POST', '/api/recipes', body);

		const items = await db.syncQueue.toArray();
		expect(JSON.parse(items[0].body)).toEqual(body);
	});

	test('serializes empty body', async () => {
		await enqueue('DELETE', '/api/foods/f1', {});

		const items = await db.syncQueue.toArray();
		expect(items[0].body).toBe('{}');
	});

	test('auto-increments id', async () => {
		await enqueue('POST', '/api/foods', { name: 'A' });
		await enqueue('POST', '/api/foods', { name: 'B' });

		const items = await db.syncQueue.toArray();
		expect(items[0].id).toBeTruthy();
		expect(items[1].id).toBeTruthy();
		expect(items[1].id).toBeGreaterThan(items[0].id!);
	});
});

describe('drainQueue', () => {
	test('returns items ordered by createdAt', async () => {
		await enqueue('POST', '/api/foods', { name: 'Second' });
		// Insert with earlier timestamp directly
		await db.syncQueue.add({
			method: 'POST',
			url: '/api/foods',
			body: '{"name":"First"}',
			createdAt: 1
		});

		const items = await drainQueue();
		expect(items).toHaveLength(2);
		expect(items[0].createdAt).toBeLessThan(items[1].createdAt);
	});

	test('returns empty array when queue is empty', async () => {
		const items = await drainQueue();
		expect(items).toEqual([]);
	});

	test('limits to 50 items', async () => {
		for (let i = 0; i < 55; i++) {
			await db.syncQueue.add({
				method: 'POST',
				url: '/api/foods',
				body: '{}',
				createdAt: i
			});
		}

		const items = await drainQueue();
		expect(items).toHaveLength(50);
	});
});

describe('removeFromQueue', () => {
	test('removes specific item by id', async () => {
		await enqueue('POST', '/api/foods', { name: 'A' });
		await enqueue('POST', '/api/foods', { name: 'B' });

		const items = await db.syncQueue.toArray();
		await removeFromQueue(items[0].id!);

		const remaining = await db.syncQueue.toArray();
		expect(remaining).toHaveLength(1);
		expect(JSON.parse(remaining[0].body).name).toBe('B');
	});
});

describe('clearQueue', () => {
	test('removes all items', async () => {
		await enqueue('POST', '/api/foods', { name: 'A' });
		await enqueue('POST', '/api/foods', { name: 'B' });

		await clearQueue();

		const items = await db.syncQueue.toArray();
		expect(items).toHaveLength(0);
	});
});
