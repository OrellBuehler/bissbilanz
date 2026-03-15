import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import type { DexieSupplement, DexieSupplementLog } from '$lib/db/types';
import { api } from '$lib/api/client';
import { enqueue } from '$lib/stores/offline-queue';
import { browser } from '$app/environment';

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
			for (const item of data.checklist) {
				if (item.supplement) {
					supsToPut.push(item.supplement as unknown as DexieSupplement);
				}
				if (item.taken && item.takenAt && item.supplement) {
					logsToPut.push({
						id: `${item.supplement.id}-${date}`,
						supplementId: item.supplement.id,
						userId: item.supplement.userId,
						date,
						takenAt: item.takenAt,
						createdAt: item.takenAt
					});
				}
			}
			if (supsToPut.length > 0) db.supplements.bulkPut(supsToPut).catch(() => {});
			if (logsToPut.length > 0) db.supplementLogs.bulkPut(logsToPut).catch(() => {});
		})
		.catch(() => {});
}

async function create(supplement: {
	name: string;
	dosage: number;
	dosageUnit: string;
	scheduleType: 'daily' | 'every_other_day' | 'weekly' | 'specific_days';
	scheduleDays?: number[] | null;
	scheduleStartDate?: string | null;
	isActive?: boolean;
	sortOrder?: number;
	timeOfDay?: ('morning' | 'noon' | 'evening') | null;
	ingredients?: { name: string; dosage: number; dosageUnit: string; sortOrder?: number }[];
}) {
	const now = new Date().toISOString();
	const id = crypto.randomUUID();
	const dexieRecord: DexieSupplement = {
		id,
		userId: '',
		name: supplement.name,
		dosage: supplement.dosage,
		dosageUnit: supplement.dosageUnit,
		scheduleType: supplement.scheduleType,
		scheduleDays: supplement.scheduleDays ?? null,
		scheduleStartDate: supplement.scheduleStartDate ?? null,
		isActive: supplement.isActive ?? true,
		sortOrder: supplement.sortOrder ?? 0,
		timeOfDay: supplement.timeOfDay ?? null,
		createdAt: now,
		updatedAt: now,
		ingredients: (supplement.ingredients ?? []).map((ing, i) => ({
			id: crypto.randomUUID(),
			supplementId: id,
			name: ing.name,
			dosage: ing.dosage,
			dosageUnit: ing.dosageUnit,
			sortOrder: ing.sortOrder ?? i
		}))
	};
	await db.supplements.put(dexieRecord);

	const { ingredients, ...rest } = supplement;
	const body = { ...rest, ...(ingredients ? { ingredients } : {}) };
	if (browser && !navigator.onLine) {
		await enqueue('POST', '/api/supplements', body, {
			affectedTable: 'supplements',
			affectedId: id
		});
	} else {
		api
			.POST('/api/supplements', { body })
			.then(({ data }) => {
				if (data) {
					db.supplements.put(data.supplement as unknown as DexieSupplement).catch(() => {});
				}
			})
			.catch(() => {});
	}
}

async function update(id: string, supplement: Record<string, unknown>) {
	const now = new Date().toISOString();
	const { ingredients: _ingredients, ...updates } = supplement;
	await db.supplements.update(id, { ...updates, updatedAt: now });

	if (browser && !navigator.onLine) {
		await enqueue('PATCH', `/api/supplements/${id}`, supplement, {
			affectedTable: 'supplements',
			affectedId: id
		});
	} else {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		api
			.PATCH('/api/supplements/{id}', {
				params: { path: { id } },
				body: supplement
			} as any)
			.then(({ data }: { data?: { supplement: unknown } }) => {
				if (data) {
					db.supplements.put(data.supplement as unknown as DexieSupplement).catch(() => {});
				}
			})
			.catch(() => {});
	}
}

async function deleteSupplement(id: string) {
	await db.supplements.delete(id);

	if (browser && !navigator.onLine) {
		await enqueue(
			'DELETE',
			`/api/supplements/${id}`,
			{},
			{ affectedTable: 'supplements', affectedId: id }
		);
	} else {
		api
			.DELETE('/api/supplements/{id}', {
				params: { path: { id } }
			})
			.catch(() => {});
	}
}

async function log(supplementId: string, date: string) {
	const now = new Date().toISOString();
	await db.supplementLogs.put({
		id: `${supplementId}-${date}`,
		supplementId,
		userId: '',
		date,
		takenAt: now,
		createdAt: now
	});

	if (browser && !navigator.onLine) {
		await enqueue(
			'POST',
			`/api/supplements/${supplementId}/log`,
			{ date },
			{ affectedTable: 'supplements', affectedId: supplementId }
		);
	} else {
		api
			.POST('/api/supplements/{id}/log', {
				params: { path: { id: supplementId } },
				body: { date }
			})
			.catch(() => {});
	}
}

async function unlog(supplementId: string, date: string) {
	await db.supplementLogs.where('[supplementId+date]').equals([supplementId, date]).delete();

	if (browser && !navigator.onLine) {
		await enqueue(
			'DELETE',
			`/api/supplements/${supplementId}/log/${date}`,
			{},
			{ affectedTable: 'supplements', affectedId: supplementId }
		);
	} else {
		api
			.DELETE('/api/supplements/{id}/log/{date}', {
				params: { path: { id: supplementId, date } }
			})
			.catch(() => {});
	}
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
