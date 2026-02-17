import { browser } from '$app/environment';
import { drainQueue, removeFromQueue } from '$lib/stores/offline-queue';

let syncing = false;

export async function syncQueue(): Promise<number> {
	if (!browser || syncing || !navigator.onLine) return 0;
	syncing = true;
	let synced = 0;

	try {
		const queued = await drainQueue();
		for (const req of queued) {
			try {
				const response = await fetch(req.url, {
					method: req.method,
					headers: { 'content-type': 'application/json' },
					body: req.method !== 'DELETE' ? req.body : undefined
				});
				if (response.ok || response.status === 400) {
					await removeFromQueue(req.id!);
					synced++;
				}
			} catch {
				break;
			}
		}
	} finally {
		syncing = false;
	}
	return synced;
}

export function startSyncListener(): void {
	if (!browser) return;
	window.addEventListener('online', () => syncQueue());
}
