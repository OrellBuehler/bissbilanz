import { browser } from '$app/environment';
import { db } from '$lib/db';

export type QueuedRequest = {
	id?: number;
	method: string;
	url: string;
	body: string;
	createdAt: number;
	affectedTable?: string;
	affectedId?: string;
	failedAt?: number;
	failureReason?: string;
	idempotencyKey?: string;
	clientEditedAt?: string;
	retryCount?: number;
	nextAttemptAt?: number;
};

export async function enqueue(
	method: string,
	url: string,
	body: object,
	meta?: { affectedTable?: string; affectedId?: string }
): Promise<void> {
	if (!browser) return;
	await db.syncQueue.add({
		method,
		url,
		body: JSON.stringify(body),
		createdAt: Date.now(),
		affectedTable: meta?.affectedTable,
		affectedId: meta?.affectedId,
		// Stable across every retry → the server replays rather than re-applies.
		idempotencyKey: crypto.randomUUID(),
		// The moment the user made this edit, for last-write-wins resolution.
		clientEditedAt: new Date().toISOString(),
		retryCount: 0,
		nextAttemptAt: 0
	});
}

/**
 * Max items returned by one {@link drainQueue} call. Callers must treat a full
 * batch as "more may be waiting" and schedule another pass — see syncQueue().
 */
export const DRAIN_BATCH_SIZE = 50;

export async function drainQueue(): Promise<QueuedRequest[]> {
	if (!browser) return [];
	const now = Date.now();
	const batch: QueuedRequest[] = [];
	// Strict FIFO: stop at the first live item still inside its backoff window
	// instead of skipping past it. Later items may depend on it (an edit or delete
	// of a row whose create is the one backing off), and overtaking it would send
	// the dependent first — a 404 that reads as "deleted on another device".
	// Dead-lettered items are skipped: the user has already been told about them.
	await db.syncQueue
		.orderBy('createdAt')
		.filter((item) => !item.failedAt)
		.until((item) => (item.nextAttemptAt ?? 0) > now || batch.length >= DRAIN_BATCH_SIZE)
		.each((item) => {
			batch.push(item);
		});
	return batch;
}

/**
 * Rewrite every live queued item that still references a client-generated id
 * after the server assigned the real one to the created row: the URL path
 * segment, the `affectedId`, and any id embedded in the JSON body (a food
 * entry's `foodId`, a recipe ingredient's `foodId`, …). Ids are UUIDs, so a
 * plain substring replace in the serialized body cannot hit anything else.
 */
export async function remapQueuedIds(tempId: string, serverId: string): Promise<void> {
	if (!browser || tempId === serverId) return;
	await db.syncQueue
		.filter((item) => !item.failedAt)
		.modify((item) => {
			rewriteIds(item, tempId, serverId);
		});
}

/** In-place id rewrite of one queued item (shared by the Dexie modify and the in-memory drain batch). */
export function rewriteIds(item: QueuedRequest, tempId: string, serverId: string): void {
	if (item.affectedId === tempId) item.affectedId = serverId;
	if (item.url.includes(tempId)) item.url = item.url.replaceAll(tempId, serverId);
	if (item.body.includes(tempId)) item.body = item.body.replaceAll(tempId, serverId);
}

/** Ids of rows in `affectedTable` with a live (not dead-lettered) queued write. */
export async function pendingIdsFor(affectedTable: string): Promise<Set<string>> {
	const ids = new Set<string>();
	if (!browser) return ids;
	await db.syncQueue
		.filter((q) => q.affectedTable === affectedTable && !q.failedAt && !!q.affectedId)
		.each((q) => {
			ids.add(q.affectedId!);
		});
	return ids;
}

/** Persist an exponential-backoff retry: bump the count and gate re-attempts. */
export async function scheduleRetry(
	id: number,
	retryCount: number,
	nextAttemptAt: number
): Promise<void> {
	if (!browser) return;
	await db.syncQueue.update(id, { retryCount, nextAttemptAt });
}

/**
 * Soonest future backoff gate among still-pending items, or null when nothing is
 * waiting. Used to schedule a timer so backed-off items eventually retry without
 * needing an online/visibility event to nudge them.
 */
export async function nextRetryAt(): Promise<number | null> {
	if (!browser) return null;
	const now = Date.now();
	let soonest: number | null = null;
	await db.syncQueue
		.filter((item) => !item.failedAt)
		.each((item) => {
			const at = item.nextAttemptAt ?? 0;
			if (at > now && (soonest === null || at < soonest)) soonest = at;
		});
	return soonest;
}

export async function markFailed(id: number, reason: string): Promise<void> {
	if (!browser) return;
	await db.syncQueue.update(id, { failedAt: Date.now(), failureReason: reason });
}

export async function listFailed(): Promise<QueuedRequest[]> {
	if (!browser) return [];
	return db.syncQueue.where('failedAt').above(0).toArray();
}

export async function countFailed(): Promise<number> {
	if (!browser) return 0;
	return db.syncQueue.where('failedAt').above(0).count();
}

export async function retryFailed(): Promise<void> {
	if (!browser) return;
	await db.syncQueue
		.where('failedAt')
		.above(0)
		.modify((item) => {
			delete item.failedAt;
			delete item.failureReason;
		});
}

export async function discardFailed(): Promise<void> {
	if (!browser) return;
	await db.syncQueue.where('failedAt').above(0).delete();
}

export async function removeFromQueue(id: number): Promise<void> {
	if (!browser) return;
	await db.syncQueue.delete(id);
}

export async function clearQueue(): Promise<void> {
	if (!browser) return;
	await db.syncQueue.clear();
}
