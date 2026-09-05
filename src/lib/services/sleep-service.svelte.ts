import { liveQuery } from 'dexie';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { refreshTable, withOfflineFallback } from './base';
import type { DexieSleepEntry } from '$lib/db/types';

function entries() {
	return liveQuery(() => db.sleepEntries.orderBy('entryDate').reverse().toArray());
}

function entryForDate(date: string) {
	return liveQuery(
		async () => (await db.sleepEntries.where('entryDate').equals(date).first()) ?? null
	);
}

async function refresh(): Promise<void> {
	if (!browser) return;
	await refreshTable<DexieSleepEntry>({
		table: db.sleepEntries,
		syncTableName: 'sleepEntries',
		fetchServer: async () => {
			const { data } = await api.GET('/api/sleep');
			return data && 'entries' in data ? (data.entries as DexieSleepEntry[]) : null;
		}
	});
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

	await withOfflineFallback(() => api.POST('/api/sleep', { body: entry }), {
		onSuccess: async (data) => {
			if ('entry' in data) {
				await db.sleepEntries.delete(tempId);
				await db.sleepEntries.put(data.entry as DexieSleepEntry);
			}
		},
		method: 'POST',
		url: '/api/sleep',
		body: entry,
		affectedTable: 'sleepEntries',
		affectedId: tempId
	});
}

type UpdateSleepEntry = Partial<CreateSleepEntry>;

async function update(id: string, entry: UpdateSleepEntry): Promise<void> {
	const now = new Date().toISOString();
	await db.sleepEntries.update(id, { ...entry, updatedAt: now });

	await withOfflineFallback(
		() =>
			api.PATCH('/api/sleep/{id}', {
				params: { path: { id } },
				body: entry
			}),
		{
			onSuccess: async (data) => {
				if ('entry' in data) {
					await db.sleepEntries.put(data.entry as DexieSleepEntry);
				}
			},
			method: 'PATCH',
			url: `/api/sleep/${id}`,
			body: entry,
			affectedTable: 'sleepEntries',
			affectedId: id
		}
	);
}

async function deleteEntry(id: string): Promise<void> {
	await db.sleepEntries.delete(id);

	await withOfflineFallback(
		() =>
			api.DELETE('/api/sleep/{id}', {
				params: { path: { id } }
			}),
		{
			method: 'DELETE',
			url: `/api/sleep/${id}`,
			body: {},
			affectedTable: 'sleepEntries',
			affectedId: id
		}
	);
}

export const sleepService = { entries, entryForDate, refresh, create, update, delete: deleteEntry };
