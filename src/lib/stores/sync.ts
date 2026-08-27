import { browser } from '$app/environment';
import {
	DRAIN_BATCH_SIZE,
	drainQueue,
	removeFromQueue,
	markFailed,
	countFailed,
	scheduleRetry,
	nextRetryAt
} from '$lib/stores/offline-queue';
import { db } from '$lib/db';
import {
	setSyncing,
	setPendingCount,
	setFailedCount,
	setLastSyncedAt,
	addSyncError,
	clearSyncErrors,
	addSyncConflict
} from '$lib/stores/sync-state.svelte';
import {
	IDEMPOTENCY_KEY_HEADER,
	CLIENT_EDITED_AT_HEADER,
	SYNC_CONFLICT_HEADER,
	SYNC_CONFLICT_SERVER_NEWER
} from '$lib/sync/contract';
import * as m from '$lib/paraglide/messages';
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
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Max transient-failure retries before an item is dead-lettered. */
const MAX_RETRIES = 5;
/** Exponential backoff base; doubles each retry up to the cap. */
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** Backoff delay for the Nth retry (1-based), with jitter to avoid thundering. */
function backoffDelay(retryCount: number): number {
	const exp = Math.min(BASE_BACKOFF_MS * 2 ** (retryCount - 1), MAX_BACKOFF_MS);
	return exp + Math.floor(Math.random() * 1000);
}

export async function syncQueue(): Promise<number> {
	if (!browser || syncing || !navigator.onLine) return 0;
	syncing = true;
	setSyncing(true);
	clearSyncErrors();
	let synced = 0;
	let queuedCount = 0;
	const affectedTables = new Set<string>();
	const trackAffected = (req: { affectedTable?: string }) => {
		if (req.affectedTable) affectedTables.add(req.affectedTable);
	};

	try {
		const queued = await drainQueue();
		queuedCount = queued.length;
		setPendingCount(queued.length);

		for (const req of queued) {
			try {
				// All queued bodies are JSON-stringified strings (FormData is excluded
				// from queuing — see apiFetch), so application/json is always correct.
				// The idempotency key + edit time make the replay safe to dedupe on the
				// server and to resolve conflicts via last-write-wins.
				const headers: Record<string, string> = { 'content-type': 'application/json' };
				if (req.idempotencyKey) headers[IDEMPOTENCY_KEY_HEADER] = req.idempotencyKey;
				if (req.clientEditedAt) headers[CLIENT_EDITED_AT_HEADER] = req.clientEditedAt;
				const response = await fetch(req.url, {
					method: req.method,
					headers,
					body: req.method !== 'DELETE' ? req.body : undefined
				});

				const conflict = response.headers.get(SYNC_CONFLICT_HEADER) === SYNC_CONFLICT_SERVER_NEWER;

				if (conflict) {
					// Last-write-wins: this offline edit lost to a newer change. Drop it,
					// surface the loss, and let the table refresh adopt server state.
					await removeFromQueue(req.id!);
					trackAffected(req);
					addSyncConflict(m.sync_conflict_superseded());
					synced++;
				} else if (response.ok) {
					// Success (including idempotent replays of an already-applied write).
					await removeFromQueue(req.id!);
					trackAffected(req);
					synced++;
				} else if (response.status === 404 || response.status === 410) {
					// The target record is gone. A delete that reaches an already-deleted
					// row has achieved its goal (idempotent success); an update means it
					// was removed on another device — surface that and move on.
					await removeFromQueue(req.id!);
					trackAffected(req);
					if (req.method !== 'DELETE') {
						addSyncConflict(m.sync_conflict_deleted());
					}
					synced++;
				} else if (response.status === 401 || response.status === 403) {
					// Auth expired — stop syncing; user needs to re-authenticate.
					// Don't remove items from queue so they can be retried after re-login.
					addSyncError('Session expired. Please log in again to sync pending changes.');
					break;
				} else if (response.status >= 400 && response.status < 500) {
					const data = await response.json().catch(() => ({}));
					const reason = (data as Record<string, string>).error ?? `HTTP ${response.status}`;

					// An in-flight idempotency claim is explicitly retryable: the server is
					// telling us an earlier attempt with this key hasn't finished yet. Dead-
					// lettering it here would discard a write the server may still apply.
					if (response.status === 409 && reason === 'request_in_progress') {
						const count = (req.retryCount ?? 0) + 1;
						if (count >= MAX_RETRIES) {
							await markFailed(req.id!, `${reason} after ${MAX_RETRIES} retries`);
							synced++;
							addSyncError(
								`Gave up syncing ${req.method} ${req.url} after ${MAX_RETRIES} retries (still in progress).`
							);
						} else {
							await scheduleRetry(req.id!, count, Date.now() + backoffDelay(count));
							break;
						}
					} else {
						// Other client errors (400, real 409 duplicate/validation, 422, …) are
						// unrecoverable as-is. Park them so the user can retry or discard.
						await markFailed(req.id!, reason);
						synced++;
						addSyncError(`Failed to sync ${req.method} ${req.url}: ${reason}`);
					}
				} else {
					// Server error (5xx) — transient; retry with exponential backoff.
					const count = (req.retryCount ?? 0) + 1;
					if (count >= MAX_RETRIES) {
						await markFailed(req.id!, `HTTP ${response.status} after ${MAX_RETRIES} retries`);
						synced++;
						addSyncError(
							`Gave up syncing ${req.method} ${req.url} after ${MAX_RETRIES} retries (server error).`
						);
					} else {
						await scheduleRetry(req.id!, count, Date.now() + backoffDelay(count));
						// Stop this pass; the backoff timer (or next event) re-drains.
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
		// Items parked in exponential backoff won't get an online/visibility nudge,
		// so schedule a timer to re-drain when the soonest one is due.
		await scheduleNextDrain();
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

	// drainQueue() returns at most DRAIN_BATCH_SIZE items. A full batch means more
	// work is very likely still queued, and an item with no backoff gate arms no
	// timer — so without this a backlog above one batch would sit untouched until
	// the next online/visibility event. Scheduled as a task (not a microtask) so
	// this pass, including the table refreshes above, fully settles first.
	if (queuedCount >= DRAIN_BATCH_SIZE && synced > 0) {
		setTimeout(() => void syncQueue(), 0);
	}

	return synced;
}

/** Arm a single timer to re-drain when the next backed-off item becomes due. */
async function scheduleNextDrain(): Promise<void> {
	if (!browser) return;
	if (retryTimer) {
		clearTimeout(retryTimer);
		retryTimer = null;
	}
	const at = await nextRetryAt();
	if (at === null) return;
	const delay = Math.max(0, at - Date.now()) + 50;
	retryTimer = setTimeout(() => {
		retryTimer = null;
		void syncQueue();
	}, delay);
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
