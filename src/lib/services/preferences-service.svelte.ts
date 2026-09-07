import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { withOfflineFallback } from './base';
import type { DexieUserPreferences } from '$lib/db/types';
import type { paths } from '$lib/api/generated/schema';

type PreferencesPatchBody = NonNullable<
	paths['/api/preferences']['patch']['requestBody']
>['content']['application/json'];

function preferences() {
	return liveQuery(() => db.userPreferences.toCollection().first());
}

async function refresh() {
	if (!browser) return;
	try {
		const { data } = await api.GET('/api/preferences');
		if (data) {
			const p = data.preferences;
			const row: DexieUserPreferences = {
				userId: 'me',
				showChartWidget: p.showChartWidget,
				showFavoritesWidget: p.showFavoritesWidget,
				showSupplementsWidget: p.showSupplementsWidget,
				showWeightWidget: p.showWeightWidget,
				showMealBreakdownWidget: p.showMealBreakdownWidget,
				showTopFoodsWidget: p.showTopFoodsWidget,
				showSleepWidget: p.showSleepWidget,
				widgetOrder: p.widgetOrder,
				mealOrder: p.mealOrder,
				startPage: p.startPage,
				favoriteTapAction: p.favoriteTapAction,
				favoriteMealAssignmentMode: p.favoriteMealAssignmentMode,
				visibleNutrients: p.visibleNutrients,
				updatedAt: p.updatedAt ?? null,
				locale: p.locale,
				timeZone: p.timeZone,
				biologicalSex: p.biologicalSex ?? null,
				waterGoalMl: p.waterGoalMl ?? null,
				favoriteMealTimeframes: (p.favoriteMealTimeframes ?? []).map((t) => ({
					id: t.id,
					userId: 'me',
					mealType: t.mealType,
					customMealTypeId: t.customMealTypeId ?? null,
					startMinute: t.startMinute,
					endMinute: t.endMinute,
					sortOrder: t.sortOrder
				}))
			};
			await db.userPreferences.where('userId').notEqual('me').delete();
			await db.userPreferences.put(row);
		}
	} catch {
		// fire-and-forget
	}
}

async function update(prefs: PreferencesPatchBody): Promise<boolean> {
	const existing = await db.userPreferences.toCollection().first();
	if (existing) {
		await db.userPreferences.put({ ...existing, ...prefs } as DexieUserPreferences);
	}

	let ok = true;
	await withOfflineFallback(
		async () => {
			const result = await api.PATCH('/api/preferences', { body: prefs });
			if (result.error) ok = false;
			return result;
		},
		{
			method: 'PATCH',
			url: '/api/preferences',
			body: prefs as Record<string, unknown>,
			affectedTable: 'userPreferences'
		}
	);
	return ok;
}

// Reports the device's IANA timezone to the server so server-side analytics/MCP
// bucket days/hours in the user's local tz. Only PATCHes when it differs from the
// stored value (loop guard); compares against the authoritative server value.
async function reportTimeZone() {
	if (!browser || !navigator.onLine) return;
	let deviceTz: string;
	try {
		deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return;
	}
	if (!deviceTz) return;
	try {
		const { data } = await api.GET('/api/preferences');
		if (!data) return;
		if (data.preferences.timeZone === deviceTz) return;
		await update({ timeZone: deviceTz });
	} catch {
		// fire-and-forget
	}
}

export const preferencesService = { preferences, refresh, update, reportTimeZone };
