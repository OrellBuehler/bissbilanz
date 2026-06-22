import { browser } from '$app/environment';
import { drainQueue, removeFromQueue, markFailed, countFailed } from '$lib/stores/offline-queue';
import { db } from '$lib/db';
import {
	setSyncing,
	setPendingCount,
	setFailedCount,
	setLastSyncedAt,
	addSyncError,
	clearSyncErrors
} from '$lib/stores/sync-state.svelte';
import { foodService } from '$lib/services/food-service.svelte';
import { recipeService } from '$lib/services/recipe-service.svelte';
import { goalsService } from '$lib/services/goals-service.svelte';
import { preferencesService } from '$lib/services/preferences-service.svelte';
import { supplementService } from '$lib/services/supplement-service.svelte';
import { weightService } from '$lib/services/weight-service.svelte';
import { mealTypeService } from '$lib/services/meal-type-service.svelte';
import { favoritesService } from '$lib/services/favorites-service.svelte';

let syncing = false;
let listenerStarted = false;

/** Max times a single queue item will be retried before being discarded. */
const MAX_RETRIES = 3;

/** Track per-item retry counts in memory (reset on page reload, which is fine). */
const retryCounts = new Map<number, number>();

export async function syncQueue(): Promise<number> {
	if (!browser || syncing || !navigator.onLine) return 0;
	syncing = true;
	setSyncing(true);
	clearSyncErrors();
	let synced = 0;
	const affectedTables = new Set<string>();

	try {
		const queued = await drainQueue();
		setPendingCount(queued.length);

		for (const req of queued) {
			try {
				// All queued bodies are JSON-stringified strings (FormData is excluded
				// from queuing — see apiFetch), so application/json is always correct.
				const response = await fetch(req.url, {
					method: req.method,
					headers: { 'content-type': 'application/json' },
					body: req.method !== 'DELETE' ? req.body : undefined
				});

				if (response.ok) {
					// Success — remove from queue
					await removeFromQueue(req.id!);
					retryCounts.delete(req.id!);
					if (req.affectedTable) affectedTables.add(req.affectedTable);
					synced++;
				} else if (response.status === 401 || response.status === 403) {
					// Auth expired — stop syncing; user needs to re-authenticate.
					// Don't remove items from queue so they can be retried after re-login.
					addSyncError('Session expired. Please log in again to sync pending changes.');
					break;
				} else if (response.status >= 400 && response.status < 500) {
					// Client error (400, 404, 409, 422, etc.) — unrecoverable as-is.
					// Park it so the user can see what failed and discard explicitly.
					const data = await response.json().catch(() => ({}));
					const reason = (data as Record<string, string>).error ?? `HTTP ${response.status}`;
					await markFailed(req.id!, reason);
					retryCounts.delete(req.id!);
					synced++;
					addSyncError(`Failed to sync ${req.method} ${req.url}: ${reason}`);
				} else {
					// Server error (5xx) — transient; track retries
					const count = (retryCounts.get(req.id!) ?? 0) + 1;
					retryCounts.set(req.id!, count);

					if (count >= MAX_RETRIES) {
						// Too many retries — park as failed; the user decides retry vs discard
						await markFailed(req.id!, `HTTP ${response.status} after ${MAX_RETRIES} retries`);
						retryCounts.delete(req.id!);
						synced++;
						addSyncError(
							`Gave up syncing ${req.method} ${req.url} after ${MAX_RETRIES} retries (server error).`
						);
					} else {
						// Stop processing and retry later
						break;
					}
				}

				setPendingCount(queued.length - synced);
			} catch {
				// Network error — stop syncing, will retry on next online event
				break;
			}
		}

		// Update sync metadata for affected tables (inside try, before syncing = false)
		if (affectedTables.size > 0) {
			const now = Date.now();
			await Promise.all(
				[...affectedTables].map((tableName) => db.syncMeta.put({ tableName, lastSyncedAt: now }))
			);
		}
	} finally {
		syncing = false;
		setSyncing(false);
		if (synced > 0) {
			setLastSyncedAt(Date.now());
		}
		// Refresh from DB to account for items added during sync
		await refreshPendingCount();
	}

	if (synced > 0 && affectedTables.size > 0) {
		const refreshMap: Record<string, () => void> = {
			foods: () => foodService.refresh(),
			recipes: () => recipeService.refresh(),
			userGoals: () => goalsService.refresh(),
			userPreferences: () => preferencesService.refresh(),
			supplements: () => supplementService.refresh(),
			weightEntries: () => weightService.refresh(),
			customMealTypes: () => mealTypeService.refresh(),
			favorites: () => favoritesService.refresh()
		};
		for (const table of affectedTables) {
			refreshMap[table]?.();
		}
	}

	return synced;
}

/** Update pending/failed counts from the current queue (for UI display). */
export async function refreshPendingCount(): Promise<void> {
	if (!browser) return;
	const pending = await db.syncQueue.filter((item) => !item.failedAt).count();
	setPendingCount(pending);
	setFailedCount(await countFailed());
}

export function startSyncListener(onSynced?: () => void): void {
	if (!browser || listenerStarted) return;
	listenerStarted = true;

	const drain = async () => {
		const count = await syncQueue();
		if (count > 0 && onSynced) onSynced();
	};

	// Drain anything queued in a previous session. The 'online' event does NOT
	// fire when the app loads while already connected, so without this an
	// offline-then-closed write would sit unsent until the next disconnect.
	// syncQueue() self-guards on offline/already-syncing, so this is safe.
	void drain();

	window.addEventListener('online', () => void drain());

	// Catch writes queued while the tab was hidden/backgrounded.
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void drain();
	});
}
