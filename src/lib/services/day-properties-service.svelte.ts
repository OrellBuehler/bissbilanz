import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { withOfflineFallback } from './base';
import type { DexieDayProperties } from '$lib/db/types';
import {
	applyDayPropertiesPatch,
	isDayPropertiesEmpty,
	type DayPropertiesPatch
} from '$lib/utils/day-properties';

function watch(date: string) {
	return liveQuery(() => db.dayProperties.get(date));
}

async function get(date: string): Promise<DexieDayProperties | null> {
	if (!browser) return null;
	const cached = await db.dayProperties.get(date);
	return cached ?? null;
}

async function refresh(date: string): Promise<DexieDayProperties | null> {
	if (!browser) return null;
	try {
		const { data } = await api.GET('/api/day-properties', {
			params: { query: { date } }
		});
		if (data && 'properties' in data && data.properties) {
			const props: DexieDayProperties = {
				date: data.properties.date,
				isFastingDay: data.properties.isFastingDay,
				notes: data.properties.notes ?? null,
				waterMl: data.properties.waterMl ?? null,
				activityCalories: data.properties.activityCalories ?? null,
				activityNote: data.properties.activityNote ?? null
			};
			await db.dayProperties.put(props);
			return props;
		}
		// No properties for this date — clear cache
		await db.dayProperties.delete(date);
		return null;
	} catch {
		return null;
	}
}

/**
 * Offline-first PATCH-style update. The Dexie mirror is written first, then the
 * change is sent (or queued while offline). A day that ends up carrying no data
 * at all is deleted rather than stored as an all-defaults row.
 */
async function update(date: string, patch: DayPropertiesPatch): Promise<boolean> {
	if (!browser) return false;

	const previous = (await db.dayProperties.get(date)) ?? null;
	const next = applyDayPropertiesPatch(previous, date, patch) as DexieDayProperties;
	const shouldDelete = isDayPropertiesEmpty(next);

	if (shouldDelete) {
		await db.dayProperties.delete(date);
	} else {
		await db.dayProperties.put(next);
	}

	let ok = true;
	try {
		if (shouldDelete) {
			await withOfflineFallback(
				async () => {
					const result = await api.DELETE('/api/day-properties', {
						params: { query: { date } }
					});
					if (!result.response.ok && result.response.status !== 204) ok = false;
					return result;
				},
				{
					method: 'DELETE',
					url: `/api/day-properties?date=${encodeURIComponent(date)}`,
					body: {},
					affectedTable: 'dayProperties',
					affectedId: date
				}
			);
		} else {
			await withOfflineFallback(
				async () => {
					const result = await api.PUT('/api/day-properties', { body: { date, ...patch } });
					if (result.error) ok = false;
					return result;
				},
				{
					method: 'PUT',
					url: '/api/day-properties',
					body: { date, ...patch },
					affectedTable: 'dayProperties',
					affectedId: date
				}
			);
		}
	} catch {
		ok = false;
	}

	if (!ok) {
		// Roll the mirror back so the UI doesn't show a change the server rejected.
		if (previous) await db.dayProperties.put(previous);
		else await db.dayProperties.delete(date);
	}
	return ok;
}

async function setFastingDay(date: string, isFastingDay: boolean): Promise<boolean> {
	return update(date, { isFastingDay });
}

export const dayPropertiesService = {
	get,
	watch,
	refresh,
	update,
	setFastingDay
};
