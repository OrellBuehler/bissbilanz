<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate } from '$lib/utils/dates';
	import { api } from '$lib/api/client';
	import EatingWindowCard from './EatingWindowCard.svelte';
	import MealSpacingCard from './MealSpacingCard.svelte';
	import NutrientAdequacyCard from './NutrientAdequacyCard.svelte';
	import type { MealEntry, DailyNutrient } from './types';

	let loading = $state(true);
	let mealTimingData = $state<MealEntry[]>([]);
	let nutrientDailyData = $state<DailyNutrient[]>([]);

	onMount(() => {
		const controller = new AbortController();
		const endDate = today();
		const startDate = shiftDate(endDate, -29);
		const signal = controller.signal;

		(async () => {
			try {
				const [mtRes, ndRes] = await Promise.all([
					api.GET('/api/analytics/meal-timing', {
						params: { query: { startDate, endDate } },
						signal
					}),
					api.GET('/api/analytics/nutrients-daily', {
						params: { query: { startDate, endDate } },
						signal
					})
				]);
				if (signal.aborted) return;
				if (mtRes.data) mealTimingData = mtRes.data.data;
				if (ndRes.data) nutrientDailyData = ndRes.data.data;
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
	<EatingWindowCard {mealTimingData} {loading} />
	<MealSpacingCard {mealTimingData} {loading} />
	<NutrientAdequacyCard {nutrientDailyData} {loading} />
</div>
