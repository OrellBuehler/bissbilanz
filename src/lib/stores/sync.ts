import { browser } from '$app/environment';
import { drainQueue, removeFromQueue } from '$lib/stores/offline-queue';
import { db } from '$lib/db';
import {
	setSyncing,
	setPendingCount,
	setLastSyncedAt,
	addSyncError,
	clearSyncErrors
} from '$lib/stores/sync-state.svelte';

let syncing = false;
let listenerStarted = false;

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
				const response = await fetch(req.url, {
					method: req.method,
					headers: { 'content-type': 'application/json' },
					body: req.method !== 'DELETE' ? req.body : undefined
				});
				if (response.ok || response.status === 400) {
					await removeFromQueue(req.id!);
					if (req.affectedTable) affectedTables.add(req.affectedTable);
					synced++;
					setPendingCount(queued.length - synced);

					// If the server rejected (400), note the error but still remove from queue
					if (response.status === 400) {
						const data = await response.json().catch(() => ({}));
						addSyncError(
							`Failed to sync ${req.method} ${req.url}: ${data.error ?? 'validation error'}`
						);
					}
				}
			} catch {
				break;
			}
		}
	} finally {
		syncing = false;
		setSyncing(false);
		if (synced > 0) {
			setLastSyncedAt(Date.now());
		}
	}

	// Update sync metadata for affected tables
	if (affectedTables.size > 0) {
		const now = Date.now();
		await Promise.all(
			[...affectedTables].map((tableName) => db.syncMeta.put({ tableName, lastSyncedAt: now }))
		);
	}

	return synced;
}

/** Update the pending count from the current queue size (for UI display). */
export async function refreshPendingCount(): Promise<void> {
	if (!browser) return;
	const queued = await drainQueue();
	setPendingCount(queued.length);
}

export function startSyncListener(onSynced?: () => void): void {
	if (!browser || listenerStarted) return;
	listenerStarted = true;
	window.addEventListener('online', async () => {
		const count = await syncQueue();
		if (count > 0 && onSynced) onSynced();
	});
}
