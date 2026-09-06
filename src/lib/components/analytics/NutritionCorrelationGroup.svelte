<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate } from '$lib/utils/dates';
	import { api } from '$lib/api/client';
	import EatingWindowCard from './EatingWindowCard.svelte';
	import MealSpacingCard from './MealSpacingCard.svelte';
	import NutrientAdequacyCard from './NutrientAdequacyCard.svelte';
	import type { MealEntry, DailyNutrient } from './types';
	import type { components } from '$lib/api/generated/schema';
	import type { CompletedFast } from '$lib/utils/fasting';

	let loading = $state(true);
	let mealTimingData = $state<MealEntry[]>([]);
	let nutrientDailyData = $state<DailyNutrient[]>([]);
	let nutrientGaps = $state<components['schemas']['NutrientGapsResponse'] | null>(null);
	let fasts = $state<CompletedFast[]>([]);

	onMount(() => {
		const controller = new AbortController();
		const endDate = today();
		const startDate = shiftDate(endDate, -29);
		const signal = controller.signal;

		(async () => {
			try {
				const [mtRes, ndRes, gapRes, fastRes] = await Promise.all([
					api.GET('/api/analytics/meal-timing', {
						params: { query: { startDate, endDate } },
						signal
					}),
					api.GET('/api/analytics/nutrients-daily', {
						params: { query: { startDate, endDate } },
						signal
					}),
					api.GET('/api/analytics/nutrient-gaps', {
						params: { query: { startDate, endDate } },
						signal
					}),
					api.GET('/api/fasts', {
						params: { query: { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z` } },
						signal
					})
				]);
				if (signal.aborted) return;
				if (mtRes.data) mealTimingData = mtRes.data.data;
				if (ndRes.data) nutrientDailyData = ndRes.data.data;
				if (gapRes.data) nutrientGaps = gapRes.data;
				if (fastRes.data && 'sessions' in fastRes.data) fasts = fastRes.data.sessions;
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') return;
			} finally {
				if (!signal.aborted) loading = false;
			}
		})();

		return () => controller.abort();
	});
</script>

<div class="space-y-4">
	<EatingWindowCard {mealTimingData} {fasts} {loading} />
	<MealSpacingCard {mealTimingData} {loading} />
	<NutrientAdequacyCard report={nutrientGaps} {loading} />
</div>
