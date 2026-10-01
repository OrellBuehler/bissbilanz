/**
 * Cross-platform offline-sync scenarios (tests/fixtures/shared/sync-scenarios.json).
 * Each case queues a few changes, scripts the server's answers and checks what the
 * drain loop did: the requests it sent and what became of every row. Android
 * (SharedSyncScenariosTest) and iOS (SharedFixtureTests.syncScenarios) run the same
 * cases through their own SyncManager. Known web differences are `divergences` in
 * the fixture, each with its reason.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { casesFor, diff, expectedFor, loadFixture } from './helpers';

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

type Step = { ref: string; op: string; id?: string; food?: string; foodId?: string };
type Scripted = { status: number; headers?: Record<string, string>; result?: string };
type Sent = { signature: string; key: string | null; body: string | undefined };

const fixture = loadFixture('sync-scenarios.json');

let tempCounter = 0;
const tempId = () => `temp_${++tempCounter}`;

async function queueStep(step: Step, ids: Map<string, string>): Promise<number> {
	let id: number;
	switch (step.op) {
		case 'createFood': {
			const foodId = tempId();
			ids.set(step.ref, foodId);
			await enqueue(
				'POST',
				'/api/foods',
				{ name: 'Skyr', servingSize: 150, servingUnit: 'g' },
				{ affectedTable: 'foods', affectedId: foodId }
			);
			break;
		}
		case 'createEntry': {
			const entryId = tempId();
			const foodId = step.food ? ids.get(step.food)! : step.foodId!;
			await enqueue(
				'POST',
				'/api/entries',
				{ foodId, mealType: 'Lunch', servings: 1, date: '2026-06-01' },
				{ affectedTable: 'foodEntries', affectedId: entryId }
			);
			break;
		}
		case 'deleteEntry':
			await enqueue(
				'DELETE',
				`/api/entries/${step.id}`,
				{},
				{ affectedTable: 'foodEntries', affectedId: step.id }
			);
			break;
		default:
			throw new Error(`unknown op ${step.op}`);
	}
	const last = await db.syncQueue.orderBy('id').last();
	id = last!.id!;
	return id;
}

function scriptedFetch(server: Record<string, Scripted[]>, sent: Sent[]) {
	const cursor = new Map<string, number>();
	return vi.fn(async (url: string, init: RequestInit) => {
		const signature = `${init.method} ${url}`;
		const headers = new Headers(init.headers);
		sent.push({
			signature,
			key: headers.get('idempotency-key'),
			body: typeof init.body === 'string' ? init.body : undefined
		});
		const script = server[signature];
		if (!script) return new Response(JSON.stringify({ error: 'unscripted' }), { status: 404 });
		const i = Math.min(cursor.get(signature) ?? 0, script.length - 1);
		cursor.set(signature, (cursor.get(signature) ?? 0) + 1);
		const { status, headers: extra, result } = script[i];
		const responseHeaders = new Headers({ 'content-type': 'application/json', ...extra });
		if (status === 204) return new Response(null, { status, headers: responseHeaders });
		if (result === 'unreadable')
			return new Response('<html>oops</html>', { status, headers: responseHeaders });
		if (result?.startsWith('created:')) {
			const created = result.slice('created:'.length);
			const envelope = signature.includes('/entries') ? 'entry' : 'food';
			return new Response(JSON.stringify({ [envelope]: { id: created } }), {
				status,
				headers: responseHeaders
			});
		}
		return new Response(JSON.stringify({ error: 'x' }), { status, headers: responseHeaders });
	});
}

describe('shared fixtures: sync-scenarios.json', () => {
	beforeEach(async () => {
		await Promise.all(db.tables.map((t) => t.clear()));
		vi.stubGlobal('navigator', { onLine: true });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const cases = casesFor(fixture, 'web');

	it('has cases', () => expect(cases.length).toBeGreaterThan(0));

	it.each(cases.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
		const { queue, server, drains, resetBackoffBetweenDrains } = c.input;
		const ids = new Map<string, string>();
		const rowIds = new Map<string, number>();
		for (const step of queue as Step[]) rowIds.set(step.ref, await queueStep(step, ids));

		const sent: Sent[] = [];
		vi.stubGlobal('fetch', scriptedFetch(server, sent));

		for (let n = 0; n < drains; n++) {
			if (n > 0 && resetBackoffBetweenDrains) {
				await db.syncQueue.toCollection().modify({ nextAttemptAt: 0 });
			}
			await syncQueue();
		}

		const rows: Record<string, string> = {};
		const retryCounts: Record<string, number> = {};
		for (const [ref, id] of rowIds) {
			const row = await db.syncQueue.get(id);
			rows[ref] = !row ? 'removed' : row.failedAt ? 'parked' : 'live';
			retryCounts[ref] = row?.retryCount ?? 0;
		}

		const bySignature = new Map<string, Set<string | null>>();
		for (const s of sent) {
			bySignature.set(s.signature, (bySignature.get(s.signature) ?? new Set()).add(s.key));
		}
		const actual = {
			requests: sent.map((s) => s.signature),
			rows,
			retryCounts,
			entryFoodIds: sent
				.filter((s) => s.signature === 'POST /api/entries')
				.map((s) => JSON.parse(s.body!).foodId),
			stableKeys: [...bySignature.values()].every((keys) => keys.size === 1)
		};

		expect(diff(actual, expectedFor(c, 'web'), 0)).toEqual([]);
	});
});
