<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate } from '$lib/utils/dates';
	import { api } from '$lib/api/client';
	import NOVAScoreCard from './NOVAScoreCard.svelte';
	import OmegaRatioCard from './OmegaRatioCard.svelte';
	import ProteinDistributionCard from './ProteinDistributionCard.svelte';
	import WeekdayWeekendCard from './WeekdayWeekendCard.svelte';
	import CalorieFrontLoadingCard from './CalorieFrontLoadingCard.svelte';
	import DIIScoreCard from './DIIScoreCard.svelte';
	import TEFCard from './TEFCard.svelte';
	import CalorieCyclingCard from './CalorieCyclingCard.svelte';
	import MealRegularityCard from './MealRegularityCard.svelte';
	import FoodDiversityCard from './FoodDiversityCard.svelte';
	import type { MealEntry } from './types';

	type NutrientEntry = {
		date: string;
		mealType: string;
		eatenAt: string | null;
		foodId: string | null;
		recipeId: string | null;
		foodName: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		novaGroup: number | null;
		omega3: number | null;
		omega6: number | null;
		sodium: number | null;
		caffeine: number | null;
		saturatedFat: number | null;
		transFat: number | null;
		vitaminC: number | null;
		vitaminD: number | null;
		vitaminE: number | null;
		alcohol: number | null;
	};

	type DiversityEntry = {
		date: string;
		foodId: string | null;
		recipeId: string | null;
		foodName: string;
	};

	let loading = $state(true);
	let nutrientEntries = $state<NutrientEntry[]>([]);
	let mealEntries = $state<MealEntry[]>([]);
	let diversityData = $state<DiversityEntry[]>([]);

	onMount(() => {
		const controller = new AbortController();
		const endDate = today();
		const startDate = shiftDate(endDate, -89);
		const signal = controller.signal;

		(async () => {
			try {
				const [nRes, mRes, dRes] = await Promise.all([
					api.GET('/api/analytics/nutrients-extended', {
						params: { query: { startDate, endDate } },
						signal
					}),
					api.GET('/api/analytics/meal-timing', {
						params: { query: { startDate, endDate } },
						signal
					}),
					api.GET('/api/analytics/food-diversity', {
						params: { query: { startDate, endDate } },
						signal
					})
				]);
				if (signal.aborted) return;
				if (nRes.data) nutrientEntries = nRes.data.data;
				if (mRes.data) mealEntries = mRes.data.data;
				if (dRes.data) diversityData = dRes.data.data;
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
	<NOVAScoreCard {nutrientEntries} {loading} />
	<OmegaRatioCard {nutrientEntries} {loading} />
	<ProteinDistributionCard {nutrientEntries} {loading} />
	<WeekdayWeekendCard {nutrientEntries} {loading} />
	<CalorieFrontLoadingCard {nutrientEntries} {loading} />
	<DIIScoreCard {nutrientEntries} {loading} />
	<TEFCard {nutrientEntries} {loading} />
	<CalorieCyclingCard {nutrientEntries} {loading} />
	<MealRegularityCard {mealEntries} {loading} />
	<FoodDiversityCard {diversityData} {loading} />
</div>
