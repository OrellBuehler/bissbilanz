/**
 * Reactive sync state store (Svelte 5 runes).
 * Tracks whether sync is in progress, pending queue count, and errors.
 */

let isSyncing = $state(false);
let pendingCount = $state(0);
let failedCount = $state(0);
let lastSyncedAt = $state<number | null>(null);
let errors = $state<string[]>([]);
/** A queued item hit a 401/403 — the user must re-authenticate before it (and anything queued after it) can sync. */
let authRequired = $state(false);
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
		},
		get authRequired() {
			return authRequired;
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
	// De-dupe identical messages so a repeatedly-retried item doesn't stack up.
	if (!errors.includes(error)) errors = [...errors, error];
}

export function dismissSyncError(error: string) {
	errors = errors.filter((e) => e !== error);
}

export function clearSyncErrors() {
	errors = [];
}

export function setAuthRequired(value: boolean) {
	authRequired = value;
}

export function addSyncConflict(message: string) {
	// De-dupe identical notices so a repeatedly-retried item doesn't stack up.
	if (!conflicts.includes(message)) conflicts = [...conflicts, message];
}

export function clearSyncConflicts() {
	conflicts = [];
}
