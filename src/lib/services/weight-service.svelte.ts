import { liveQuery } from 'dexie';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { refreshTable, withOfflineFallback } from './base';
import type { DexieWeightEntry } from '$lib/db/types';

function entries() {
	return liveQuery(() => db.weightEntries.orderBy('entryDate').reverse().toArray());
}

function latest() {
	return liveQuery(() => db.weightEntries.orderBy('entryDate').reverse().first());
}

async function refresh(): Promise<void> {
	if (!browser) return;
	await refreshTable<DexieWeightEntry>({
		table: db.weightEntries,
		syncTableName: 'weightEntries',
		fetchServer: async () => {
			const { data } = await api.GET('/api/weight');
			return data && 'entries' in data ? (data.entries as DexieWeightEntry[]) : null;
		}
	});
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

	await withOfflineFallback(() => api.POST('/api/weight', { body: entry }), {
		onSuccess: async (data) => {
			if ('entry' in data) {
				await db.weightEntries.delete(tempId);
				await db.weightEntries.put(data.entry as DexieWeightEntry);
			}
		},
		method: 'POST',
		url: '/api/weight',
		body: entry,
		affectedTable: 'weightEntries',
		affectedId: tempId
	});
}

async function update(
	id: string,
	entry: { weightKg?: number; entryDate?: string; notes?: string | null }
): Promise<void> {
	const now = new Date().toISOString();
	await db.weightEntries.update(id, { ...entry, updatedAt: now });

	await withOfflineFallback(
		() =>
			api.PATCH('/api/weight/{id}', {
				params: { path: { id } },
				body: entry
			}),
		{
			onSuccess: async (data) => {
				if ('entry' in data) {
					await db.weightEntries.put(data.entry as DexieWeightEntry);
				}
			},
			method: 'PATCH',
			url: `/api/weight/${id}`,
			body: entry,
			affectedTable: 'weightEntries',
			affectedId: id
		}
	);
}

async function deleteEntry(id: string): Promise<void> {
	await db.weightEntries.delete(id);

	await withOfflineFallback(
		() =>
			api.DELETE('/api/weight/{id}', {
				params: { path: { id } }
			}),
		{
			method: 'DELETE',
			url: `/api/weight/${id}`,
			body: {},
			affectedTable: 'weightEntries',
			affectedId: id
		}
	);
}

export const weightService = { entries, latest, refresh, create, update, delete: deleteEntry };
