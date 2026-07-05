<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate } from '$lib/utils/dates';
	import { api } from '$lib/api/client';
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
					api.GET('/api/analytics/weight-food', {
						params: { query: { startDate, endDate } },
						signal
					}),
					api.GET('/api/analytics/nutrients-daily', {
						params: { query: { startDate, endDate } },
						signal
					}),
					api.GET('/api/analytics/meal-timing', {
						params: { query: { startDate, endDate } },
						signal
					})
				]);
				if (signal.aborted) return;
				if (wfRes.data) weightFoodData = wfRes.data.data;
				if (ndRes.data) nutrientDailyData = ndRes.data.data;
				if (mtRes.data) mealTimingData = mtRes.data.data;
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
