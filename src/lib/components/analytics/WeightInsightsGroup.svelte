<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate } from '$lib/utils/dates';
	import AdaptiveTDEECard from './AdaptiveTDEECard.svelte';
	import PlateauDetectionCard from './PlateauDetectionCard.svelte';
	import WeightForecastCard from './WeightForecastCard.svelte';
	import SodiumWeightCard from './SodiumWeightCard.svelte';

	type WeightFoodPoint = {
		date: string;
		calories: number | null;
		weightKg: number | null;
		movingAvg: number | null;
	};

	type NutrientEntry = {
		date: string;
		sodium: number | null;
		[key: string]: unknown;
	};

	let loading = $state(true);
	let weightFoodData = $state<WeightFoodPoint[]>([]);
	let nutrientData = $state<NutrientEntry[]>([]);

	onMount(async () => {
		const endDate = today();
		const startDate = shiftDate(endDate, -89);
		try {
			const [wfRes, neRes] = await Promise.all([
				fetch(`/api/analytics/weight-food?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/nutrients-extended?startDate=${startDate}&endDate=${endDate}`)
			]);
			if (wfRes.ok) weightFoodData = (await wfRes.json()).data ?? [];
			if (neRes.ok) nutrientData = (await neRes.json()).data ?? [];
		} catch {
			// cards show no-data state
		} finally {
			loading = false;
		}
	});
</script>

<div class="space-y-4">
	<AdaptiveTDEECard {weightFoodData} {loading} />
	<PlateauDetectionCard {weightFoodData} {nutrientData} {loading} />
	<WeightForecastCard {weightFoodData} {loading} />
	<SodiumWeightCard {weightFoodData} {nutrientData} {loading} />
</div>
