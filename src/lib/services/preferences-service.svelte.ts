import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import { api } from '$lib/api/client';
import { enqueue } from '$lib/stores/offline-queue';
import { urlToMeta } from '$lib/utils/api';
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
				startPage: p.startPage,
				favoriteTapAction: p.favoriteTapAction,
				favoriteMealAssignmentMode: p.favoriteMealAssignmentMode,
				visibleNutrients: p.visibleNutrients,
				navTabs: (p as { navTabs?: string[] }).navTabs ?? ['favorites', 'foods', 'insights'],
				updatedAt: p.updatedAt ?? null,
				locale: p.locale,
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

	if (browser && !navigator.onLine) {
		const meta = urlToMeta('/api/preferences');
		await enqueue('PATCH', '/api/preferences', prefs as Record<string, unknown>, meta);
		return true;
	}

	try {
		const { error } = await api.PATCH('/api/preferences', { body: prefs });
		return !error;
	} catch {
		return false;
	}
}

export const preferencesService = { preferences, refresh, update };
