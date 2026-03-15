import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import type { DexieCustomMealType } from '$lib/db/types';

function mealTypes() {
	return liveQuery(() => db.customMealTypes.orderBy('sortOrder').toArray());
}

function refresh() {
	api
		.GET('/api/meal-types')
		.then(({ data }) => {
			if (data?.mealTypes) {
				db.customMealTypes.bulkPut(data.mealTypes as DexieCustomMealType[]).catch(() => {});
			}
		})
		.catch(() => {});
}

export const mealTypeService = {
	mealTypes,
	refresh
};
