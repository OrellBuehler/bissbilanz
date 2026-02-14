import { browser } from '$app/environment';

export type QueuedRequest = {
	id?: number;
	method: string;
	url: string;
	body: string;
	createdAt: number;
};

const DB_NAME = 'bissbilanz-offline';
const STORE_NAME = 'requests';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			req.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function enqueue(method: string, url: string, body: object): Promise<void> {
	if (!browser) return;
	const db = await openDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	tx.objectStore(STORE_NAME).add({
		method,
		url,
		body: JSON.stringify(body),
		createdAt: Date.now()
	});
	await new Promise((resolve, reject) => {
		tx.oncomplete = resolve;
		tx.onerror = reject;
	});
}

export async function drainQueue(): Promise<QueuedRequest[]> {
	if (!browser) return [];
	const db = await openDB();
	const tx = db.transaction(STORE_NAME, 'readonly');
	const store = tx.objectStore(STORE_NAME);
	return new Promise((resolve, reject) => {
		const req = store.getAll();
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function removeFromQueue(id: number): Promise<void> {
	if (!browser) return;
	const db = await openDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	tx.objectStore(STORE_NAME).delete(id);
	await new Promise((resolve, reject) => {
		tx.oncomplete = resolve;
		tx.onerror = reject;
	});
}
