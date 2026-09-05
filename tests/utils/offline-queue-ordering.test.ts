import { describe, expect, test, beforeEach } from 'vitest';
import { db } from '$lib/db';
import {
	enqueue,
	drainQueue,
	scheduleRetry,
	markFailed,
	remapQueuedIds,
	pendingIdsFor
} from '$lib/stores/offline-queue';

const TEMP = '11111111-1111-4111-8111-111111111111';
const SERVER = '22222222-2222-4222-8222-222222222222';

describe('drainQueue ordering', () => {
	beforeEach(async () => {
		await db.syncQueue.clear();
	});

	test('returns live items oldest first', async () => {
		await enqueue('POST', '/api/foods', { n: 1 });
		await enqueue('PATCH', '/api/foods/x', { n: 2 });
		await enqueue('DELETE', '/api/foods/x', {});
		const batch = await drainQueue();
		expect(batch.map((i) => i.method)).toEqual(['POST', 'PATCH', 'DELETE']);
	});

	// A backed-off create must block the writes queued after it: sending the
	// dependent PATCH first would 404 and be reported as "deleted elsewhere".
	test('stops at the first item still in backoff instead of skipping past it', async () => {
		await enqueue('POST', '/api/foods', { n: 1 }, { affectedTable: 'foods', affectedId: TEMP });
		await enqueue('PATCH', `/api/foods/${TEMP}`, { n: 2 }, { affectedTable: 'foods' });
		const [create] = await drainQueue();
		await scheduleRetry(create.id!, 1, Date.now() + 60_000);

		expect(await drainQueue()).toHaveLength(0);
	});

	test('a due backed-off item drains together with its followers', async () => {
		await enqueue('POST', '/api/foods', { n: 1 });
		await enqueue('PATCH', '/api/foods/x', { n: 2 });
		const [create] = await drainQueue();
		await scheduleRetry(create.id!, 1, Date.now() - 1);

		expect(await drainQueue()).toHaveLength(2);
	});

	test('dead-lettered items are skipped without blocking later ones', async () => {
		await enqueue('POST', '/api/foods', { n: 1 });
		await enqueue('PATCH', '/api/foods/x', { n: 2 });
		const [first] = await drainQueue();
		await markFailed(first.id!, 'HTTP 400');

		const batch = await drainQueue();
		expect(batch.map((i) => i.method)).toEqual(['PATCH']);
	});
});

describe('remapQueuedIds', () => {
	beforeEach(async () => {
		await db.syncQueue.clear();
	});

	test('rewrites url, body and affectedId of live items referencing the temp id', async () => {
		await enqueue(
			'PATCH',
			`/api/foods/${TEMP}`,
			{ name: 'x' },
			{ affectedTable: 'foods', affectedId: TEMP }
		);
		await enqueue(
			'POST',
			'/api/entries',
			{ foodId: TEMP, amount: 1 },
			{ affectedTable: 'foodEntries', affectedId: 'e1' }
		);
		await enqueue(
			'DELETE',
			'/api/foods/other',
			{},
			{ affectedTable: 'foods', affectedId: 'other' }
		);

		await remapQueuedIds(TEMP, SERVER);

		const [patch, post, del] = await db.syncQueue.orderBy('createdAt').toArray();
		expect(patch.url).toBe(`/api/foods/${SERVER}`);
		expect(patch.affectedId).toBe(SERVER);
		expect(JSON.parse(post.body)).toEqual({ foodId: SERVER, amount: 1 });
		expect(post.affectedId).toBe('e1');
		expect(del.url).toBe('/api/foods/other');
	});

	test('leaves dead-lettered items untouched', async () => {
		await enqueue('PATCH', `/api/foods/${TEMP}`, {}, { affectedTable: 'foods', affectedId: TEMP });
		const [item] = await drainQueue();
		await markFailed(item.id!, 'HTTP 400');

		await remapQueuedIds(TEMP, SERVER);

		const [failed] = await db.syncQueue.toArray();
		expect(failed.url).toBe(`/api/foods/${TEMP}`);
	});
});

describe('pendingIdsFor', () => {
	beforeEach(async () => {
		await db.syncQueue.clear();
	});

	test('collects affected ids of live items for the table only', async () => {
		await enqueue('PATCH', '/api/foods/a', {}, { affectedTable: 'foods', affectedId: 'a' });
		await enqueue('PATCH', '/api/recipes/b', {}, { affectedTable: 'recipes', affectedId: 'b' });
		await enqueue('PATCH', '/api/foods/c', {}, { affectedTable: 'foods', affectedId: 'c' });
		const items = await drainQueue();
		await markFailed(items[2].id!, 'HTTP 400');

		expect(await pendingIdsFor('foods')).toEqual(new Set(['a']));
	});
});
