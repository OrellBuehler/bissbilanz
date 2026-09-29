/**
 * Cross-platform offline-sync conflict handling. Every case in
 * tests/fixtures/shared/conflict-resolution.json is a queued write plus a server
 * response; the web queue must dispose of it the way the fixture says. Android
 * (SharedFixturesTest) and iOS (SharedFixtureTests) drive the same cases through
 * their own drain loops. Known web divergences are listed in the fixture itself.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { casesFor, expectedFor, loadFixture } from './helpers';

const addSyncConflict = vi.hoisted(() => vi.fn());

vi.mock('$lib/stores/sync-state.svelte', () => ({
	setSyncing: vi.fn(),
	setPendingCount: vi.fn(),
	setFailedCount: vi.fn(),
	setLastSyncedAt: vi.fn(),
	addSyncError: vi.fn(),
	clearSyncErrors: vi.fn(),
	addSyncConflict,
	setAuthRequired: vi.fn()
}));
vi.mock('$lib/paraglide/messages', () => ({
	sync_conflict_superseded: () => 'superseded',
	sync_conflict_deleted: () => 'deleted',
	sync_error_item: () => 'error item',
	sync_error_gave_up: () => 'gave up',
	sync_error_dependency: () => 'dependency'
}));
vi.mock('$lib/utils/client-version', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/utils/client-version')>()),
	reloadForUpdate: vi.fn(async () => {})
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
const { enqueue } = await import('$lib/stores/offline-queue');
const { syncQueue } = await import('$lib/stores/sync');

const fixture = loadFixture('conflict-resolution.json');

const request = (op: string): { method: string; url: string } => {
	switch (op) {
		case 'update':
			return { method: 'PATCH', url: '/api/entries/e1' };
		case 'delete':
			return { method: 'DELETE', url: '/api/entries/e1' };
		case 'create':
			return { method: 'POST', url: '/api/entries' };
		default:
			throw new Error(`unknown op ${op}`);
	}
};

describe('shared fixtures: conflict-resolution.json', () => {
	beforeEach(async () => {
		await Promise.all(db.tables.map((t) => t.clear()));
		addSyncConflict.mockClear();
		vi.stubGlobal('navigator', { onLine: true });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const cases = casesFor(fixture, 'web');

	it('has cases', () => expect(cases.length).toBeGreaterThan(0));

	it.each(cases.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
		const { op, status, conflictHeader } = c.input;
		const { method, url } = request(op);
		await enqueue(method, url, { a: 1 });
		const headers = new Headers({ 'content-type': 'application/json' });
		if (conflictHeader) headers.set('X-Sync-Conflict', conflictHeader);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				status === 204
					? new Response(null, { status, headers })
					: new Response(JSON.stringify({ error: 'x' }), { status, headers })
			)
		);

		await syncQueue();

		const items = await db.syncQueue.toArray();
		const live = items.filter((i) => !i.failedAt);
		const parked = items.filter((i) => i.failedAt);
		const queue =
			parked.length === 1 && live.length === 0
				? 'parked'
				: items.length === 0
					? 'removed'
					: live.length === 1 && parked.length === 0
						? live[0].retryCount === 0
							? 'kept'
							: 'retry'
						: `unexpected(live=${live.length}, parked=${parked.length})`;

		const expected = expectedFor(c, 'web') as { queue: string; conflictNotice: boolean | null };
		expect(queue).toBe(expected.queue);
		if (expected.queue === 'retry') expect(live[0].retryCount).toBe(1);
		if (expected.conflictNotice !== null) {
			expect(addSyncConflict.mock.calls.length > 0).toBe(expected.conflictNotice);
		}
	});
});
