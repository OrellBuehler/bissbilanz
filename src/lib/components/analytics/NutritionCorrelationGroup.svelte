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

	onMount(async () => {
		const endDate = today();
		const startDate = shiftDate(endDate, -29);
		try {
			const [mtRes, ndRes] = await Promise.all([
				fetch(`/api/analytics/meal-timing?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/nutrients-daily?startDate=${startDate}&endDate=${endDate}`)
			]);
			if (mtRes.ok) mealTimingData = (await mtRes.json()).data ?? [];
			if (ndRes.ok) nutrientDailyData = (await ndRes.json()).data ?? [];
		} catch {
			// cards show no-data state
		} finally {
			loading = false;
		}
	});
</script>

<div class="space-y-4">
	<EatingWindowCard {mealTimingData} {loading} />
	<MealSpacingCard {mealTimingData} {loading} />
	<NutrientAdequacyCard {nutrientDailyData} {loading} />
</div>
