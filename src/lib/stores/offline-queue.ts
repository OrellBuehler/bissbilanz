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
		affectedId: meta?.affectedId
	});
}

export async function drainQueue(): Promise<QueuedRequest[]> {
	if (!browser) return [];
	return db.syncQueue
		.orderBy('createdAt')
		.filter((item) => !item.failedAt)
		.limit(50)
		.toArray();
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
