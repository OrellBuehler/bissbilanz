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
	return db.syncQueue.orderBy('createdAt').limit(50).toArray();
}

export async function removeFromQueue(id: number): Promise<void> {
	if (!browser) return;
	await db.syncQueue.delete(id);
}

export async function clearQueue(): Promise<void> {
	if (!browser) return;
	await db.syncQueue.clear();
}
