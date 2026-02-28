/**
 * Reactive sync state store (Svelte 5 runes).
 * Tracks whether sync is in progress, pending queue count, and errors.
 */

let isSyncing = $state(false);
let pendingCount = $state(0);
let lastSyncedAt = $state<number | null>(null);
let errors = $state<string[]>([]);

export function getSyncState() {
	return {
		get isSyncing() {
			return isSyncing;
		},
		get pendingCount() {
			return pendingCount;
		},
		get lastSyncedAt() {
			return lastSyncedAt;
		},
		get errors() {
			return errors;
		}
	};
}

export function setSyncing(value: boolean) {
	isSyncing = value;
}

export function setPendingCount(count: number) {
	pendingCount = count;
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
