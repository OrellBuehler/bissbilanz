import { liveQuery } from 'dexie';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { enqueue } from '$lib/stores/offline-queue';
import { urlToMeta } from '$lib/utils/api';
import type { DexieWeightEntry } from '$lib/db/types';

function entries() {
	return liveQuery(() => db.weightEntries.orderBy('entryDate').reverse().toArray());
}

function latest() {
	return liveQuery(() => db.weightEntries.orderBy('entryDate').reverse().first());
}

async function refresh(): Promise<void> {
	if (!browser) return;
	try {
		const { data } = await api.GET('/api/weight');
		if (data && 'entries' in data) {
			const serverEntries = data.entries as DexieWeightEntry[];
			const serverIds = new Set(serverEntries.map((e) => e.id));
			const localIds = await db.weightEntries.toCollection().primaryKeys();
			const staleIds = localIds.filter((id) => !serverIds.has(id as string));
			await db.transaction('rw', db.weightEntries, db.syncMeta, async () => {
				if (staleIds.length > 0) await db.weightEntries.bulkDelete(staleIds as string[]);
				await db.weightEntries.bulkPut(serverEntries);
				await db.syncMeta.put({ tableName: 'weightEntries', lastSyncedAt: Date.now() });
			});
		}
	} catch {
		// fire-and-forget — offline or network error is fine
	}
}

async function create(entry: {
	weightKg: number;
	entryDate: string;
	notes?: string | null;
}): Promise<void> {
	const tempId = crypto.randomUUID();
	const now = new Date().toISOString();
	const tempEntry: DexieWeightEntry = {
		id: tempId,
		userId: '',
		weightKg: entry.weightKg,
		entryDate: entry.entryDate,
		loggedAt: now,
		notes: entry.notes ?? null,
		createdAt: now,
		updatedAt: now
	};
	await db.weightEntries.put(tempEntry);

	try {
		const { data, response } = await api.POST('/api/weight', { body: entry });
		if (response.headers.get('x-queued') === 'true') return;
		if (data && 'entry' in data) {
			await db.weightEntries.delete(tempId);
			await db.weightEntries.put(data.entry as DexieWeightEntry);
		}
	} catch {
		await enqueue('POST', '/api/weight', entry, urlToMeta('/api/weight'));
	}
}

async function update(
	id: string,
	entry: { weightKg?: number; entryDate?: string; notes?: string | null }
): Promise<void> {
	const now = new Date().toISOString();
	await db.weightEntries.update(id, { ...entry, updatedAt: now });

	try {
		const { data, response } = await api.PATCH('/api/weight/{id}', {
			params: { path: { id } },
			body: entry
		});
		if (response.headers.get('x-queued') === 'true') return;
		if (data && 'entry' in data) {
			await db.weightEntries.put(data.entry as DexieWeightEntry);
		}
	} catch {
		await enqueue('PATCH', `/api/weight/${id}`, entry, urlToMeta(`/api/weight/${id}`));
	}
}

async function deleteEntry(id: string): Promise<void> {
	await db.weightEntries.delete(id);

	try {
		const { response } = await api.DELETE('/api/weight/{id}', {
			params: { path: { id } }
		});
		if (response.headers.get('x-queued') === 'true') return;
	} catch {
		await enqueue('DELETE', `/api/weight/${id}`, {}, urlToMeta(`/api/weight/${id}`));
	}
}

export const weightService = { entries, latest, refresh, create, update, delete: deleteEntry };
