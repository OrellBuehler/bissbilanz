import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import type { DexieFood, DexieSupplement, DexieSupplementLog } from '$lib/db/types';
import { api } from '$lib/api/client';
import { withOfflineFallback } from './base';
import { entryService } from './entry-service.svelte';
import type { paths } from '$lib/api/generated/schema';

type SupplementCreate =
	paths['/api/supplements']['post']['requestBody']['content']['application/json'];
type SupplementUpdate =
	paths['/api/supplements/{id}']['patch']['requestBody']['content']['application/json'];

type ChecklistItem = {
	supplement: DexieSupplement;
	taken: boolean;
	takenAt: string | null;
};

function supplements(includeInactive?: boolean) {
	return liveQuery(async () => {
		let results: DexieSupplement[];
		if (includeInactive) {
			results = await db.supplements.toArray();
		} else {
			results = await db.supplements.filter((s) => s.isActive === true).toArray();
		}
		return results.sort((a, b) => a.sortOrder - b.sortOrder);
	});
}

function checklist(date: string) {
	return liveQuery(async () => {
		const activeSups = await db.supplements.filter((s) => s.isActive === true).toArray();
		const logs = await db.supplementLogs.where('date').equals(date).toArray();
		const logMap = new Map<string, DexieSupplementLog>();
		for (const log of logs) {
			logMap.set(log.supplementId, log);
		}
		const items: ChecklistItem[] = activeSups
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((s) => {
				const log = logMap.get(s.id);
				return {
					supplement: s,
					taken: !!log,
					takenAt: log?.takenAt ?? null
				};
			});
		return items;
	});
}

function refresh() {
	api
		.GET('/api/supplements', { params: { query: { all: true } } })
		.then(({ data }) => {
			if (data) {
				db.supplements.bulkPut(data.supplements as unknown as DexieSupplement[]).catch(() => {});
				// Cache backing foods so the form/checklist can look them up offline
				const backingFoods: DexieFood[] = [];
				for (const s of data.supplements) {
					for (const ing of s.ingredients ?? []) {
						if (ing.food) backingFoods.push(ing.food as unknown as DexieFood);
					}
				}
				if (backingFoods.length > 0) db.foods.bulkPut(backingFoods).catch(() => {});
			}
		})
		.catch(() => {});
}

function refreshChecklist(date: string) {
	api
		.GET('/api/supplements/{date}/checklist', { params: { path: { date } } })
		.then(({ data }) => {
			if (!data) return;
			const supsToPut: DexieSupplement[] = [];
			const logsToPut: DexieSupplementLog[] = [];
			const foodsToPut: DexieFood[] = [];
			for (const item of data.checklist) {
				if (item.supplement) {
					supsToPut.push(item.supplement as unknown as DexieSupplement);
					for (const ing of item.supplement.ingredients ?? []) {
						if (ing.food) foodsToPut.push(ing.food as unknown as DexieFood);
					}
				}
				if (item.taken && item.takenAt && item.supplement) {
					logsToPut.push({
						supplementId: item.supplement.id,
						date,
						takenAt: item.takenAt,
						entryIds: []
					});
				}
			}
			if (supsToPut.length > 0) db.supplements.bulkPut(supsToPut).catch(() => {});
			if (foodsToPut.length > 0) db.foods.bulkPut(foodsToPut).catch(() => {});
			if (logsToPut.length > 0) db.supplementLogs.bulkPut(logsToPut).catch(() => {});
		})
		.catch(() => {});
}

async function create(supplement: SupplementCreate) {
	const now = new Date().toISOString();
	const id = crypto.randomUUID();
	// Optimistic local insert — backing food data is already in Dexie (foods
	// were created first via the food service); ingredients will be fleshed
	// out on the server response.
	const dexieRecord: DexieSupplement = {
		id,
		userId: '',
		name: supplement.name,
		scheduleType: supplement.scheduleType,
		scheduleDays: supplement.scheduleDays ?? null,
		scheduleStartDate: supplement.scheduleStartDate ?? null,
		isActive: supplement.isActive ?? true,
		sortOrder: supplement.sortOrder ?? 0,
		timeOfDay: supplement.timeOfDay ?? null,
		reminderTimes: supplement.reminderTimes ?? null,
		createdAt: now,
		updatedAt: now,
		ingredients: []
	};
	await db.supplements.put(dexieRecord);

	await withOfflineFallback(() => api.POST('/api/supplements', { body: supplement }), {
		onSuccess: async (data) => {
			await db.supplements.delete(id);
			await db.supplements.put(data.supplement as unknown as DexieSupplement);
		},
		method: 'POST',
		url: '/api/supplements',
		body: supplement,
		affectedTable: 'supplements',
		affectedId: id
	});
}

async function update(id: string, supplement: SupplementUpdate) {
	const now = new Date().toISOString();
	const { ingredients: _ingredients, ...updates } = supplement;
	await db.supplements.update(id, { ...updates, updatedAt: now });

	await withOfflineFallback(
		() =>
			api.PATCH('/api/supplements/{id}', {
				params: { path: { id } },
				body: supplement
			}),
		{
			onSuccess: async (data) => {
				await db.supplements.put(data.supplement as unknown as DexieSupplement);
			},
			method: 'PATCH',
			url: `/api/supplements/${id}`,
			body: supplement,
			affectedTable: 'supplements',
			affectedId: id
		}
	);
}

async function deleteSupplement(id: string) {
	await db.supplements.delete(id);

	await withOfflineFallback(
		() =>
			api.DELETE('/api/supplements/{id}', {
				params: { path: { id } }
			}),
		{
			method: 'DELETE',
			url: `/api/supplements/${id}`,
			body: {},
			affectedTable: 'supplements',
			affectedId: id
		}
	);
}

async function log(supplementId: string, date: string) {
	const now = new Date().toISOString();
	await db.supplementLogs.put({
		supplementId,
		date,
		takenAt: now,
		entryIds: []
	});

	await withOfflineFallback(
		() =>
			api.POST('/api/supplements/{id}/log', {
				params: { path: { id: supplementId } },
				body: { date }
			}),
		{
			method: 'POST',
			url: `/api/supplements/${supplementId}/log`,
			body: { date },
			affectedTable: 'supplements',
			affectedId: supplementId,
			// The server logs a calorie-bearing supplement as a `Snacks` food entry,
			// so refresh the day's entries to surface it in the log and macro totals.
			onSuccess: () => {
				entryService.refresh(date).catch(() => {});
			}
		}
	);
}

async function unlog(supplementId: string, date: string) {
	await db.supplementLogs.where('[supplementId+date]').equals([supplementId, date]).delete();

	await withOfflineFallback(
		() =>
			api.DELETE('/api/supplements/{id}/log/{date}', {
				params: { path: { id: supplementId, date } }
			}),
		{
			method: 'DELETE',
			url: `/api/supplements/${supplementId}/log/${date}`,
			body: {},
			affectedTable: 'supplements',
			affectedId: supplementId,
			// Unlogging deletes the supplement's `Snacks` food entry server-side, so
			// refresh the day's entries to drop it from the log and macro totals.
			onSuccess: () => {
				entryService.refresh(date).catch(() => {});
			}
		}
	);
}

export const supplementService = {
	supplements,
	checklist,
	refresh,
	refreshChecklist,
	create,
	update,
	delete: deleteSupplement,
	log,
	unlog
};
