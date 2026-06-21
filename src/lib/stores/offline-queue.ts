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

export async function drainQueue(): Promise<QueuedRequest[]> {
	if (!browser) return [];
	const now = Date.now();
	return (
		db.syncQueue
			.orderBy('createdAt')
			// Skip dead-lettered items and anything still inside its backoff window.
			.filter((item) => !item.failedAt && (item.nextAttemptAt ?? 0) <= now)
			.limit(50)
			.toArray()
	);
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
