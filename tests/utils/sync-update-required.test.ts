/**
 * A 426 means this bundle is below the server's minimum version. The queued
 * writes must survive untouched so the updated bundle can replay them.
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
	addSyncConflict: vi.fn(),
	setAuthRequired: vi.fn()
}));
vi.mock('$lib/paraglide/messages', () => ({
	sync_conflict_superseded: () => 'superseded',
	sync_conflict_deleted: () => 'deleted',
	sync_error_item: () => 'error item',
	sync_error_gave_up: () => 'gave up',
	sync_error_dependency: () => 'dependency'
}));
const reloadForUpdate = vi.fn(async () => {});
vi.mock('$lib/utils/client-version', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/utils/client-version')>()),
	reloadForUpdate
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
const { enqueue, countFailed } = await import('$lib/stores/offline-queue');
const { syncQueue } = await import('$lib/stores/sync');

const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('sync handling of 426 update required', () => {
	beforeEach(async () => {
		await Promise.all(db.tables.map((t) => t.clear()));
		vi.stubGlobal('navigator', { onLine: true });
		reloadForUpdate.mockClear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('keeps every item queued with no retry burned and triggers a reload', async () => {
		await enqueue('POST', '/api/entries', { a: 1 });
		await enqueue('POST', '/api/weight', { b: 2 });
		const fetchMock = vi.fn(async () =>
			jsonResponse(426, { error: 'Update required', code: 'client_update_required' })
		);
		vi.stubGlobal('fetch', fetchMock);

		await syncQueue();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(reloadForUpdate).toHaveBeenCalledTimes(1);
		expect(await countFailed()).toBe(0);
		const items = await db.syncQueue.toArray();
		expect(items).toHaveLength(2);
		expect(items.every((item) => !item.retryCount && !item.nextAttemptAt)).toBe(true);
	});
});
