import { browser } from '$app/environment';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import type { DexieDayProperties } from '$lib/db/types';

async function get(date: string): Promise<DexieDayProperties | null> {
	if (!browser) return null;
	const cached = await db.dayProperties.get(date);
	if (cached) return cached;
	return null;
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
				isFastingDay: data.properties.isFastingDay
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

async function setFastingDay(date: string, isFastingDay: boolean): Promise<boolean> {
	if (!browser) return false;

	// Optimistic update
	if (isFastingDay) {
		await db.dayProperties.put({ date, isFastingDay: true });
	} else {
		await db.dayProperties.delete(date);
	}

	try {
		if (isFastingDay) {
			const { response } = await api.PUT('/api/day-properties', {
				body: { date, isFastingDay: true }
			});
			return response.ok;
		} else {
			const { response } = await api.DELETE('/api/day-properties', {
				params: { query: { date } }
			});
			return response.ok || response.status === 204;
		}
	} catch {
		// Revert optimistic update on failure
		if (isFastingDay) {
			await db.dayProperties.delete(date);
		}
		return false;
	}
}

export const dayPropertiesService = {
	get,
	refresh,
	setFastingDay
};
