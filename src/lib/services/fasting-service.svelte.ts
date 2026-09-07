import { liveQuery } from 'dexie';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { refreshTable, withOfflineFallback } from './base';
import type { DexieFastingSession } from '$lib/db/types';

export const FASTING_PAGE_SIZE = 20;

function sessions() {
	return liveQuery(() => db.fastingSessions.orderBy('startedAt').reverse().toArray());
}

/**
 * Mirrors the newest `limit` sessions. Older rows already in Dexie are kept:
 * the reconcile window is bounded by the oldest row the server returned, so a
 * paged refresh never deletes history that simply fell outside the page.
 */
async function refresh(limit = FASTING_PAGE_SIZE): Promise<{ hasMore: boolean }> {
	if (!browser) return { hasMore: false };
	let hasMore = false;
	let oldest: string | null = null;
	await refreshTable<DexieFastingSession>({
		table: db.fastingSessions,
		syncTableName: 'fastingSessions',
		fetchServer: async () => {
			const { data } = await api.GET('/api/fasts', { params: { query: { limit } } });
			if (!data || !('sessions' in data)) return null;
			const rows = data.sessions as DexieFastingSession[];
			hasMore = rows.length >= limit;
			oldest = rows.length > 0 ? rows[rows.length - 1].startedAt : null;
			return rows;
		},
		keepLocalRow: (row) => !oldest || row.startedAt >= oldest
	});
	return { hasMore };
}

/**
 * Uploads a finished fast. The id was minted when the fast started, so a retry
 * (or an edit made while the first upload was still queued) lands on the same
 * server row instead of duplicating it.
 */
async function complete(session: {
	id: string;
	startedAt: string;
	endedAt: string;
	targetHours: number;
}): Promise<void> {
	const now = new Date().toISOString();
	await db.fastingSessions.put({
		...session,
		userId: '',
		createdAt: now,
		updatedAt: now
	});

	await withOfflineFallback(() => api.POST('/api/fasts', { body: session }), {
		onSuccess: async (data) => {
			if ('session' in data) {
				await db.fastingSessions.put(data.session as DexieFastingSession);
			}
		},
		method: 'POST',
		url: '/api/fasts',
		body: session,
		affectedTable: 'fastingSessions',
		affectedId: session.id
	});
}

async function update(
	id: string,
	patch: { startedAt?: string; endedAt?: string; targetHours?: number }
): Promise<void> {
	await db.fastingSessions.update(id, { ...patch, updatedAt: new Date().toISOString() });

	await withOfflineFallback(
		() => api.PATCH('/api/fasts/{id}', { params: { path: { id } }, body: patch }),
		{
			onSuccess: async (data) => {
				if (data && 'session' in data) {
					await db.fastingSessions.put(data.session as DexieFastingSession);
				}
			},
			method: 'PATCH',
			url: `/api/fasts/${id}`,
			body: patch,
			affectedTable: 'fastingSessions',
			affectedId: id
		}
	);
}

async function remove(id: string): Promise<void> {
	await db.fastingSessions.delete(id);

	await withOfflineFallback(() => api.DELETE('/api/fasts/{id}', { params: { path: { id } } }), {
		method: 'DELETE',
		url: `/api/fasts/${id}`,
		body: {},
		affectedTable: 'fastingSessions',
		affectedId: id
	});
}

export const fastingService = { sessions, refresh, complete, update, delete: remove };
