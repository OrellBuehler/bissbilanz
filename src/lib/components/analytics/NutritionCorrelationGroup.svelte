<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate } from '$lib/utils/dates';
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
					fetch(`/api/analytics/meal-timing?startDate=${startDate}&endDate=${endDate}`, { signal }),
					fetch(`/api/analytics/nutrients-daily?startDate=${startDate}&endDate=${endDate}`, { signal })
				]);
				if (signal.aborted) return;
				if (mtRes.ok) mealTimingData = (await mtRes.json()).data ?? [];
				if (ndRes.ok) nutrientDailyData = (await ndRes.json()).data ?? [];
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
