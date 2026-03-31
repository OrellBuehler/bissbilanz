<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate } from '$lib/utils/dates';
	import CaloricLagCard from './CaloricLagCard.svelte';
	import MacroImpactCard from './MacroImpactCard.svelte';
	import MealTimingWeightCard from './MealTimingWeightCard.svelte';
	import MicronutrientGapsCard from './MicronutrientGapsCard.svelte';
	import type { WeightFoodPoint, MealEntry, DailyNutrient } from './types';

	let loading = $state(true);
	let weightFoodData = $state<WeightFoodPoint[]>([]);
	let nutrientDailyData = $state<DailyNutrient[]>([]);
	let mealTimingData = $state<MealEntry[]>([]);

	onMount(() => {
		const controller = new AbortController();
		const endDate = today();
		const startDate = shiftDate(endDate, -29);
		const signal = controller.signal;

		(async () => {
			try {
				const [wfRes, ndRes, mtRes] = await Promise.all([
					fetch(`/api/analytics/weight-food?startDate=${startDate}&endDate=${endDate}`, { signal }),
					fetch(`/api/analytics/nutrients-daily?startDate=${startDate}&endDate=${endDate}`, { signal }),
					fetch(`/api/analytics/meal-timing?startDate=${startDate}&endDate=${endDate}`, { signal })
				]);
				if (signal.aborted) return;
				if (wfRes.ok) weightFoodData = (await wfRes.json()).data ?? [];
				if (ndRes.ok) nutrientDailyData = (await ndRes.json()).data ?? [];
				if (mtRes.ok) mealTimingData = (await mtRes.json()).data ?? [];
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
	<CaloricLagCard {weightFoodData} {loading} />
	<MacroImpactCard {weightFoodData} {nutrientDailyData} {loading} />
	<MealTimingWeightCard {weightFoodData} {mealTimingData} {loading} />
	<MicronutrientGapsCard {weightFoodData} {nutrientDailyData} {loading} />
</div>
