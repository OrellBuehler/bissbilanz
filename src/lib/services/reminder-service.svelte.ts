import { liveQuery } from 'dexie';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { refreshTable, withOfflineFallback } from './base';
import type { DexieReminder } from '$lib/db/types';
import type { paths } from '$lib/api/generated/schema';

type ReminderCreate = paths['/api/reminders']['post']['requestBody']['content']['application/json'];
type ReminderUpdate =
	paths['/api/reminders/{id}']['patch']['requestBody']['content']['application/json'];

function reminders() {
	return liveQuery(() => db.reminders.orderBy('time').toArray());
}

async function refresh(): Promise<void> {
	if (!browser) return;
	await refreshTable<DexieReminder>({
		table: db.reminders,
		syncTableName: 'reminders',
		fetchServer: async () => {
			const { data } = await api.GET('/api/reminders');
			return data ? (data.reminders as DexieReminder[]) : null;
		}
	});
}

async function create(reminder: ReminderCreate): Promise<void> {
	const tempId = crypto.randomUUID();
	const now = new Date().toISOString();
	const tempRecord: DexieReminder = {
		id: tempId,
		userId: '',
		kind: reminder.kind,
		mealType: reminder.kind === 'meal' ? (reminder.mealType ?? null) : null,
		time: reminder.time,
		weekdays: reminder.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
		enabled: reminder.enabled ?? true,
		createdAt: now,
		updatedAt: now
	};
	await db.reminders.put(tempRecord);

	await withOfflineFallback(() => api.POST('/api/reminders', { body: reminder }), {
		onSuccess: async (data) => {
			await db.reminders.delete(tempId);
			await db.reminders.put(data.reminder as DexieReminder);
		},
		method: 'POST',
		url: '/api/reminders',
		body: reminder,
		affectedTable: 'reminders',
		affectedId: tempId
	});
}

async function update(id: string, reminder: ReminderUpdate): Promise<void> {
	const now = new Date().toISOString();
	const patch: Partial<DexieReminder> = { ...reminder, updatedAt: now };
	if (reminder.kind !== undefined) {
		patch.mealType = reminder.kind === 'meal' ? (reminder.mealType ?? null) : null;
	}
	await db.reminders.update(id, patch);

	await withOfflineFallback(
		() => api.PATCH('/api/reminders/{id}', { params: { path: { id } }, body: reminder }),
		{
			onSuccess: async (data) => {
				await db.reminders.put(data.reminder as DexieReminder);
			},
			method: 'PATCH',
			url: `/api/reminders/${id}`,
			body: reminder,
			affectedTable: 'reminders',
			affectedId: id
		}
	);
}

async function deleteReminder(id: string): Promise<void> {
	await db.reminders.delete(id);

	await withOfflineFallback(() => api.DELETE('/api/reminders/{id}', { params: { path: { id } } }), {
		method: 'DELETE',
		url: `/api/reminders/${id}`,
		body: {},
		affectedTable: 'reminders',
		affectedId: id
	});
}

export const reminderService = {
	reminders,
	refresh,
	create,
	update,
	delete: deleteReminder
};
