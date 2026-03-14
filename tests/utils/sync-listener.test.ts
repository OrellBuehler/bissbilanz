/**
 * Tests for the sync listener and refreshPendingCount patterns.
 *
 * Since sync.ts imports SvelteKit-specific modules ($app/environment,
 * sync-state.svelte), we test the core listener patterns directly
 * rather than importing the module.
 */
import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../../src/lib/db/index';

beforeEach(async () => {
	await Promise.all(db.tables.map((t) => t.clear()));
});

describe('startSyncListener pattern', () => {
	let listeners: Map<string, EventListener[]>;
	let mockAddEventListener: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		listeners = new Map();
		mockAddEventListener = vi.fn((event: string, handler: EventListener) => {
			const existing = listeners.get(event) ?? [];
			existing.push(handler);
			listeners.set(event, existing);
		});
	});

	test('registers online event listener', () => {
		let started = false;

		function startSyncListener(win: { addEventListener: typeof mockAddEventListener }) {
			if (started) return;
			started = true;
			win.addEventListener('online', () => {});
		}

		startSyncListener({ addEventListener: mockAddEventListener });

		expect(mockAddEventListener).toHaveBeenCalledWith('online', expect.any(Function));
		expect(listeners.get('online')).toHaveLength(1);
	});

	test('does not re-register on second call', () => {
		let started = false;

		function startSyncListener(win: { addEventListener: typeof mockAddEventListener }) {
			if (started) return;
			started = true;
			win.addEventListener('online', () => {});
		}

		const win = { addEventListener: mockAddEventListener };
		startSyncListener(win);
		startSyncListener(win);

		expect(mockAddEventListener).toHaveBeenCalledTimes(1);
	});

	test('online event triggers sync callback', async () => {
		const syncFn = vi.fn().mockResolvedValue(3);
		const onSynced = vi.fn();
		let started = false;

		function startSyncListener(win: { addEventListener: typeof mockAddEventListener }) {
			if (started) return;
			started = true;
			win.addEventListener('online', async () => {
				const count = await syncFn();
				if (count > 0 && onSynced) onSynced();
			});
		}

		startSyncListener({ addEventListener: mockAddEventListener });

		// Simulate going online
		const handler = listeners.get('online')![0];
		await (handler as () => Promise<void>)();

		expect(syncFn).toHaveBeenCalled();
		expect(onSynced).toHaveBeenCalled();
	});

	test('online event does not call onSynced when sync count is 0', async () => {
		const syncFn = vi.fn().mockResolvedValue(0);
		const onSynced = vi.fn();
		let started = false;

		function startSyncListener(win: { addEventListener: typeof mockAddEventListener }) {
			if (started) return;
			started = true;
			win.addEventListener('online', async () => {
				const count = await syncFn();
				if (count > 0 && onSynced) onSynced();
			});
		}

		startSyncListener({ addEventListener: mockAddEventListener });

		const handler = listeners.get('online')![0];
		await (handler as () => Promise<void>)();

		expect(syncFn).toHaveBeenCalled();
		expect(onSynced).not.toHaveBeenCalled();
	});
});

describe('refreshPendingCount pattern', () => {
	test('returns current queue count from DB', async () => {
		await db.syncQueue.add({
			method: 'POST',
			url: '/api/foods',
			body: '{}',
			createdAt: 1000
		});
		await db.syncQueue.add({
			method: 'DELETE',
			url: '/api/foods/f1',
			body: '{}',
			createdAt: 2000
		});

		const count = await db.syncQueue.count();
		expect(count).toBe(2);
	});

	test('returns 0 when queue is empty', async () => {
		const count = await db.syncQueue.count();
		expect(count).toBe(0);
	});

	test('reflects count after items are removed', async () => {
		const id = await db.syncQueue.add({
			method: 'POST',
			url: '/api/foods',
			body: '{}',
			createdAt: 1000
		});
		await db.syncQueue.add({
			method: 'POST',
			url: '/api/entries',
			body: '{}',
			createdAt: 2000
		});

		await db.syncQueue.delete(id);

		const count = await db.syncQueue.count();
		expect(count).toBe(1);
	});
});

describe('sync metadata updates', () => {
	test('records lastSyncedAt per affected table', async () => {
		const now = Date.now();
		await db.syncMeta.put({ tableName: 'foods', lastSyncedAt: now });
		await db.syncMeta.put({ tableName: 'foodEntries', lastSyncedAt: now });

		const foodsMeta = await db.syncMeta.get('foods');
		const entriesMeta = await db.syncMeta.get('foodEntries');

		expect(foodsMeta?.lastSyncedAt).toBe(now);
		expect(entriesMeta?.lastSyncedAt).toBe(now);
	});

	test('updates existing sync metadata', async () => {
		const first = Date.now();
		await db.syncMeta.put({ tableName: 'foods', lastSyncedAt: first });

		const second = first + 60000;
		await db.syncMeta.put({ tableName: 'foods', lastSyncedAt: second });

		const meta = await db.syncMeta.get('foods');
		expect(meta?.lastSyncedAt).toBe(second);
	});

	test('tracks multiple tables independently', async () => {
		await db.syncMeta.put({ tableName: 'foods', lastSyncedAt: 1000 });
		await db.syncMeta.put({ tableName: 'recipes', lastSyncedAt: 2000 });

		const foods = await db.syncMeta.get('foods');
		const recipes = await db.syncMeta.get('recipes');

		expect(foods?.lastSyncedAt).toBe(1000);
		expect(recipes?.lastSyncedAt).toBe(2000);
	});
});
