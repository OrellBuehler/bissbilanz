/**
 * Reactive sync state store (Svelte 5 runes).
 * Tracks whether sync is in progress, pending queue count, and errors.
 */

let isSyncing = $state(false);
let pendingCount = $state(0);
let failedCount = $state(0);
let lastSyncedAt = $state<number | null>(null);
let errors = $state<string[]>([]);
/**
 * Non-fatal conflict notices: an offline edit that lost last-write-wins to a
 * newer change, or targeted a record deleted on another device. Surfaced so the
 * resolution is never silent; the user dismisses them (local state already
 * converged to the server via refresh).
 */
let conflicts = $state<string[]>([]);

export function getSyncState() {
	return {
		get isSyncing() {
			return isSyncing;
		},
		get pendingCount() {
			return pendingCount;
		},
		get failedCount() {
			return failedCount;
		},
		get lastSyncedAt() {
			return lastSyncedAt;
		},
		get errors() {
			return errors;
		},
		get conflicts() {
			return conflicts;
		}
	};
}

export function setSyncing(value: boolean) {
	isSyncing = value;
}

export function setPendingCount(count: number) {
	pendingCount = count;
}

export function setFailedCount(count: number) {
	failedCount = count;
}

export function setLastSyncedAt(timestamp: number) {
	lastSyncedAt = timestamp;
}

export function addSyncError(error: string) {
	errors = [...errors, error];
}

export function clearSyncErrors() {
	errors = [];
}

export function addSyncConflict(message: string) {
	// De-dupe identical notices so a repeatedly-retried item doesn't stack up.
	if (!conflicts.includes(message)) conflicts = [...conflicts, message];
}

export function clearSyncConflicts() {
	conflicts = [];
}
