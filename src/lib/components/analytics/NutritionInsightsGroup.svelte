<script lang="ts">
	import { onMount } from 'svelte';
	import { today, shiftDate } from '$lib/utils/dates';
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

	type MealEntry = {
		date: string;
		mealType: string;
		eatenAt: string | null;
		calories: number;
		foodName: string;
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

	onMount(async () => {
		const endDate = today();
		const startDate = shiftDate(endDate, -89);
		try {
			const [nRes, mRes, dRes] = await Promise.all([
				fetch(`/api/analytics/nutrients-extended?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/meal-timing?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/food-diversity?startDate=${startDate}&endDate=${endDate}`)
			]);
			if (nRes.ok) nutrientEntries = (await nRes.json()).data ?? [];
			if (mRes.ok) mealEntries = (await mRes.json()).data ?? [];
			if (dRes.ok) diversityData = (await dRes.json()).data ?? [];
		} catch {
			// individual cards handle empty data gracefully
		} finally {
			loading = false;
		}
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
