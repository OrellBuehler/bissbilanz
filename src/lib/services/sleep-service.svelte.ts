import { liveQuery } from 'dexie';
import { browser } from '$app/environment';
import { db } from '$lib/db';
// TODO: switch to typed api client once sleep endpoints are added to the OpenAPI schema
import { apiFetch } from '$lib/utils/api';
import { enqueue } from '$lib/stores/offline-queue';
import { urlToMeta } from '$lib/utils/api';
import type { DexieSleepEntry } from '$lib/db/types';

function entries() {
	return liveQuery(() => db.sleepEntries.orderBy('entryDate').reverse().toArray());
}

async function refresh(): Promise<void> {
	if (!browser) return;
	try {
		const response = await apiFetch('/api/sleep');
		if (!response.ok) return;
		const data = await response.json();
		if (data && 'entries' in data) {
			const serverEntries = data.entries as DexieSleepEntry[];
			const serverIds = new Set(serverEntries.map((e) => e.id));
			const localIds = await db.sleepEntries.toCollection().primaryKeys();
			const staleIds = localIds.filter((id) => !serverIds.has(id as string));
			await db.transaction('rw', db.sleepEntries, db.syncMeta, async () => {
				if (staleIds.length > 0) await db.sleepEntries.bulkDelete(staleIds as string[]);
				await db.sleepEntries.bulkPut(serverEntries);
				await db.syncMeta.put({ tableName: 'sleepEntries', lastSyncedAt: Date.now() });
			});
		}
	} catch {
		// fire-and-forget — offline or network error is fine
	}
}

type CreateSleepEntry = {
	durationMinutes: number;
	quality: number;
	entryDate: string;
	bedtime?: string | null;
	wakeTime?: string | null;
	wakeUps?: number | null;
	notes?: string | null;
};

async function create(entry: CreateSleepEntry): Promise<void> {
	const tempId = crypto.randomUUID();
	const now = new Date().toISOString();
	const tempEntry: DexieSleepEntry = {
		id: tempId,
		userId: '',
		durationMinutes: entry.durationMinutes,
		quality: entry.quality,
		entryDate: entry.entryDate,
		bedtime: entry.bedtime ?? null,
		wakeTime: entry.wakeTime ?? null,
		wakeUps: entry.wakeUps ?? null,
		sleepLatencyMinutes: null,
		deepSleepMinutes: null,
		lightSleepMinutes: null,
		remSleepMinutes: null,
		source: null,
		notes: entry.notes ?? null,
		loggedAt: now,
		createdAt: now,
		updatedAt: now
	};
	await db.sleepEntries.put(tempEntry);

	try {
		const response = await apiFetch('/api/sleep', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(entry)
		});
		if (response.headers.get('x-queued') === 'true') return;
		if (response.ok) {
			const data = await response.json();
			if (data && 'entry' in data) {
				await db.sleepEntries.delete(tempId);
				await db.sleepEntries.put(data.entry as DexieSleepEntry);
			}
		}
	} catch {
		await enqueue('POST', '/api/sleep', entry, urlToMeta('/api/sleep'));
	}
}

type UpdateSleepEntry = Partial<CreateSleepEntry>;

async function update(id: string, entry: UpdateSleepEntry): Promise<void> {
	const now = new Date().toISOString();
	await db.sleepEntries.update(id, { ...entry, updatedAt: now });

	try {
		const response = await apiFetch(`/api/sleep/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(entry)
		});
		if (response.headers.get('x-queued') === 'true') return;
		if (response.ok) {
			const data = await response.json();
			if (data && 'entry' in data) {
				await db.sleepEntries.put(data.entry as DexieSleepEntry);
			}
		}
	} catch {
		await enqueue('PATCH', `/api/sleep/${id}`, entry, urlToMeta(`/api/sleep/${id}`));
	}
}

async function deleteEntry(id: string): Promise<void> {
	await db.sleepEntries.delete(id);

	try {
		const response = await apiFetch(`/api/sleep/${id}`, { method: 'DELETE' });
		if (response.headers.get('x-queued') === 'true') return;
	} catch {
		await enqueue('DELETE', `/api/sleep/${id}`, {}, urlToMeta(`/api/sleep/${id}`));
	}
}

export const sleepService = { entries, refresh, create, update, delete: deleteEntry };
