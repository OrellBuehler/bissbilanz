/**
 * Exercises the real syncQueue() response-branch logic. sync.ts pulls in several
 * `.svelte.ts` rune modules, so those are mocked out; the offline queue and Dexie
 * layer stay real so the assertions are about actual persisted queue state.
 */
import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$lib/stores/sync-state.svelte', () => ({
	setSyncing: vi.fn(),
	setPendingCount: vi.fn(),
	setFailedCount: vi.fn(),
	setLastSyncedAt: vi.fn(),
	addSyncError: vi.fn(),
	clearSyncErrors: vi.fn(),
	addSyncConflict: vi.fn()
}));
vi.mock('$lib/paraglide/messages', () => ({
	sync_conflict_superseded: () => 'superseded',
	sync_conflict_deleted: () => 'deleted'
}));
vi.mock('$lib/services/food-service.svelte', () => ({ foodService: { refresh: vi.fn() } }));
vi.mock('$lib/services/recipe-service.svelte', () => ({ recipeService: { refresh: vi.fn() } }));
vi.mock('$lib/services/goals-service.svelte', () => ({ goalsService: { refresh: vi.fn() } }));
vi.mock('$lib/services/preferences-service.svelte', () => ({
	preferencesService: { refresh: vi.fn() }
}));
vi.mock('$lib/services/supplement-service.svelte', () => ({
	supplementService: { refresh: vi.fn() }
}));
vi.mock('$lib/services/weight-service.svelte', () => ({ weightService: { refresh: vi.fn() } }));
vi.mock('$lib/services/meal-type-service.svelte', () => ({
	mealTypeService: { refresh: vi.fn() }
}));
vi.mock('$lib/services/favorites-service.svelte', () => ({
	favoritesService: { refresh: vi.fn() }
}));

const { db } = await import('$lib/db');
const { enqueue, countFailed, drainQueue } = await import('$lib/stores/offline-queue');
const { syncQueue } = await import('$lib/stores/sync');

const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('sync handling of an in-flight idempotency claim', () => {
	beforeEach(async () => {
		await Promise.all(db.tables.map((t) => t.clear()));
		// No jsdom environment here, so provide the online flag syncQueue() gates on.
		vi.stubGlobal('navigator', { onLine: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	// The server answers 503 request_in_progress to mean "an earlier attempt with
	// this key hasn't finished — back off and retry". It must not be dead-lettered
	// like a client error, or the user's write is lost.
	test('keeps the item queued and schedules a retry instead of dead-lettering', async () => {
		await enqueue('POST', '/api/entries', { a: 1 });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResponse(503, { error: 'request_in_progress' }))
		);

		await syncQueue();

		expect(await countFailed()).toBe(0);
		expect(await db.syncQueue.count()).toBe(1);
		const [item] = await db.syncQueue.toArray();
		expect(item.retryCount).toBe(1);
		expect(item.nextAttemptAt).toBeGreaterThan(Date.now());
	});

	test('a genuine client error is still dead-lettered', async () => {
		await enqueue('POST', '/api/entries', { a: 1 });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResponse(400, { error: 'Validation failed' }))
		);

		await syncQueue();

		expect(await countFailed()).toBe(1);
		expect(await drainQueue()).toHaveLength(0);
	});

	test('a 409 duplicate/validation conflict is dead-lettered', async () => {
		await enqueue('POST', '/api/foods', { a: 1 });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResponse(409, { error: 'duplicate_barcode' }))
		);

		await syncQueue();

		expect(await countFailed()).toBe(1);
	});
});
