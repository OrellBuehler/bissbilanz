import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { enqueue } from '$lib/stores/offline-queue';
import { urlToMeta } from '$lib/utils/api';
import type { DexieUserGoals } from '$lib/db/types';

function goals() {
	return liveQuery(() => db.userGoals.toCollection().first());
}

async function refresh() {
	if (!browser) return;
	try {
		const { data } = await api.GET('/api/goals');
		if (data?.goals) {
			const row: DexieUserGoals = {
				userId: data.goals.userId ?? 'me',
				calorieGoal: data.goals.calorieGoal,
				proteinGoal: data.goals.proteinGoal,
				carbGoal: data.goals.carbGoal,
				fatGoal: data.goals.fatGoal,
				fiberGoal: data.goals.fiberGoal,
				sodiumGoal: data.goals.sodiumGoal ?? null,
				sugarGoal: data.goals.sugarGoal ?? null,
				updatedAt: data.goals.updatedAt ?? null
			};
			await db.userGoals.put(row);
		}
	} catch {
		// fire-and-forget — offline or network error
	}
}

async function save(form: {
	calorieGoal: number;
	proteinGoal: number;
	carbGoal: number;
	fatGoal: number;
	fiberGoal: number;
}): Promise<boolean> {
	const existing = await db.userGoals.toCollection().first();
	const row: DexieUserGoals = {
		userId: existing?.userId ?? 'me',
		calorieGoal: form.calorieGoal,
		proteinGoal: form.proteinGoal,
		carbGoal: form.carbGoal,
		fatGoal: form.fatGoal,
		fiberGoal: form.fiberGoal,
		sodiumGoal: existing?.sodiumGoal ?? null,
		sugarGoal: existing?.sugarGoal ?? null,
		updatedAt: new Date().toISOString()
	};
	await db.userGoals.put(row);

	if (browser && !navigator.onLine) {
		const meta = urlToMeta('/api/goals');
		await enqueue('POST', '/api/goals', form, meta);
		return true;
	}

	try {
		const { error } = await api.POST('/api/goals', { body: form });
		return !error;
	} catch {
		return false;
	}
}

export const goalsService = { goals, refresh, save };
