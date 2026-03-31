<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate } from '$lib/utils/dates';
	import AdaptiveTDEECard from './AdaptiveTDEECard.svelte';
	import PlateauDetectionCard from './PlateauDetectionCard.svelte';
	import WeightForecastCard from './WeightForecastCard.svelte';
	import SodiumWeightCard from './SodiumWeightCard.svelte';
	import type { WeightFoodPoint } from './types';

	type NutrientEntry = {
		date: string;
		sodium: number | null;
		[key: string]: unknown;
	};

	let loading = $state(true);
	let weightFoodData = $state<WeightFoodPoint[]>([]);
	let nutrientData = $state<NutrientEntry[]>([]);

	onMount(() => {
		const controller = new AbortController();
		const endDate = today();
		const startDate = shiftDate(endDate, -89);
		const signal = controller.signal;

		(async () => {
			try {
				const [wfRes, neRes] = await Promise.all([
					fetch(`/api/analytics/weight-food?startDate=${startDate}&endDate=${endDate}`, { signal }),
					fetch(`/api/analytics/nutrients-extended?startDate=${startDate}&endDate=${endDate}`, {
						signal
					})
				]);
				if (signal.aborted) return;
				if (wfRes.ok) weightFoodData = (await wfRes.json()).data ?? [];
				if (neRes.ok) nutrientData = (await neRes.json()).data ?? [];
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
	<AdaptiveTDEECard {weightFoodData} {loading} />
	<PlateauDetectionCard {weightFoodData} {nutrientData} {loading} />
	<WeightForecastCard {weightFoodData} {loading} />
	<SodiumWeightCard {weightFoodData} {nutrientData} {loading} />
</div>
