<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate } from '$lib/utils/dates';
	import { api } from '$lib/api/client';
	import { goalsService } from '$lib/services/goals-service.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import AdaptiveTDEECard from './AdaptiveTDEECard.svelte';
	import PlateauDetectionCard from './PlateauDetectionCard.svelte';
	import WeightForecastCard from './WeightForecastCard.svelte';
	import SodiumWeightCard from './SodiumWeightCard.svelte';
	import type { WeightFoodPoint } from './types';

	type NutrientEntry = {
		date: string;
		calories: number;
		sodium: number | null;
		[key: string]: unknown;
	};

	let loading = $state(true);
	let weightFoodData = $state<WeightFoodPoint[]>([]);
	let nutrientData = $state<NutrientEntry[]>([]);

	const cachedGoals = useLiveQuery(() => goalsService.goals(), undefined);
	const targetWeightKg = $derived(cachedGoals.value?.targetWeightKg ?? null);
	const targetDate = $derived(cachedGoals.value?.targetDate ?? null);

	$effect(() => {
		goalsService.refresh();
	});

	onMount(() => {
		const controller = new AbortController();
		const endDate = today();
		const startDate = shiftDate(endDate, -89);
		const signal = controller.signal;

		(async () => {
			try {
				const [wfRes, neRes] = await Promise.all([
					api.GET('/api/analytics/weight-food', {
						params: { query: { startDate, endDate } },
						signal
					}),
					api.GET('/api/analytics/nutrients-extended', {
						params: { query: { startDate, endDate } },
						signal
					})
				]);
				if (signal.aborted) return;
				if (wfRes.data) weightFoodData = wfRes.data.data;
				if (neRes.data) nutrientData = neRes.data.data;
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
	<PlateauDetectionCard {weightFoodData} {loading} {targetWeightKg} {targetDate} />
	<WeightForecastCard {weightFoodData} {loading} {targetWeightKg} {targetDate} />
	<SodiumWeightCard {weightFoodData} {nutrientData} {loading} />
</div>
