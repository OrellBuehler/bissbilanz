import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import type { DexieCustomMealType } from '$lib/db/types';

function mealTypes() {
	return liveQuery(() => db.customMealTypes.orderBy('sortOrder').toArray());
}

async function refresh() {
	const { data } = await api.GET('/api/meal-types');
	if (!data?.mealTypes) return;
	await db.customMealTypes.bulkPut(data.mealTypes as DexieCustomMealType[]);
}

export const mealTypeService = {
	mealTypes,
	refresh
};
