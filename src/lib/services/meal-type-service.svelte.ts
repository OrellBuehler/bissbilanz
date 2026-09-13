import { liveQuery } from 'dexie';
import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';
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
				db.customMealTypes
					.bulkPut(data.mealTypes as DexieCustomMealType[])
					.catch((err) =>
						Sentry.captureException(err, { extra: { context: 'meal-type-service.refresh' } })
					);
			}
		})
		.catch((err) => {
			if (!(browser && !navigator.onLine)) {
				Sentry.captureException(err, { extra: { context: 'meal-type-service.refresh' } });
			}
		});
}

export const mealTypeService = {
	mealTypes,
	refresh
};
