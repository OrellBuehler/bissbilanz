import { toast } from 'svelte-sonner';
import { useLiveQuery } from '$lib/db/live.svelte';
import { preferencesService } from '$lib/services/preferences-service.svelte';
import * as m from '$lib/paraglide/messages';
import { MAX_PINNED_INSIGHTS, normalizePins, reducePins } from './pins';
import type { InsightCardId } from './card-ids';

/**
 * Pinned analytics cards live in the server-backed preferences row, so the
 * store simply mirrors the Dexie cache and PATCHes through the offline queue.
 */
export function createPinStore() {
	const prefs = useLiveQuery(() => preferencesService.preferences(), undefined);
	const pins = $derived(normalizePins(prefs.value?.pinnedInsights));

	const isPinned = (id: InsightCardId) => pins.includes(id);

	const toggle = async (id: InsightCardId) => {
		const result = reducePins(pins, { type: 'toggle', id });
		if (!result.changed) {
			if (result.rejected === 'limit-reached') {
				toast.error(m.insights_pin_limit({ count: MAX_PINNED_INSIGHTS.toString() }));
			}
			return;
		}
		const wasPinned = pins.includes(id);
		await preferencesService.update({ pinnedInsights: result.pins });
		toast.success(wasPinned ? m.insights_unpinned() : m.insights_pinned());
	};

	return {
		get pins() {
			return pins;
		},
		get loading() {
			return prefs.value === undefined;
		},
		isPinned,
		toggle
	};
}
