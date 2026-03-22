<script lang="ts">
	import { onMount } from 'svelte';
	import InsightCard from './InsightCard.svelte';
	import { detectFoodSleepPatterns } from '$lib/analytics/food-sleep';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import * as m from '$lib/paraglide/messages';
	import { today, shiftDate } from '$lib/utils/dates';

	type SleepFoodPoint = {
		date: string;
		eveningCalories: number | null;
		sleepDurationMinutes: number | null;
		sleepQuality: number | null;
	};

	type MealEntry = {
		date: string;
		mealType: string;
		eatenAt: string | null;
		calories: number;
		foodName: string;
	};

	let loading = $state(true);
	let error = $state<string | null>(null);
	let sleepFoodData = $state<SleepFoodPoint[]>([]);
	let mealEntries = $state<MealEntry[]>([]);

	const patterns = $derived(() => {
		if (sleepFoodData.length === 0 || mealEntries.length === 0) return null;

		const sleepData = sleepFoodData
			.filter((d) => d.sleepQuality !== null)
			.map((d) => ({ date: d.date, quality: d.sleepQuality as number }));

		if (sleepData.length === 0) return null;

		const eveningFoods = mealEntries
			.filter((e) => {
				if (!e.eatenAt) return false;
				const hour = new Date(e.eatenAt).getHours();
				return hour >= 17;
			})
			.map((e) => ({
				date: e.date,
				foodId: e.foodName,
				foodName: e.foodName,
				nutrients: {}
			}));

		return detectFoodSleepPatterns(eveningFoods, sleepData, 3);
	});

	const sampleSize = $derived(() => sleepFoodData.filter((d) => d.sleepQuality !== null).length);
	const confidence = $derived(() => getConfidenceLevel(sampleSize()));

	const betterSleep = $derived(() =>
		(patterns()?.foodImpacts ?? []).filter((f) => f.delta > 0.3).slice(0, 5)
	);
	const worseSleep = $derived(() =>
		(patterns()?.foodImpacts ?? []).filter((f) => f.delta < -0.3).slice(0, 5)
	);

	onMount(async () => {
		try {
			const endDate = today();
			const startDate = shiftDate(endDate, -59);
			const [sfRes, mRes] = await Promise.all([
				fetch(`/api/analytics/sleep-food?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/meal-timing?startDate=${startDate}&endDate=${endDate}`)
			]);
			if (!sfRes.ok || !mRes.ok) throw new Error('Failed to fetch');
			const [sfJson, mJson] = await Promise.all([sfRes.json(), mRes.json()]);
			sleepFoodData = sfJson.data ?? [];
			mealEntries = mJson.data ?? [];
		} catch {
			error = 'Failed to load data';
		} finally {
			loading = false;
		}
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-purple-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else if error}
	<div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{error}</div>
{:else}
	<InsightCard
		title={m.analytics_food_sleep()}
		headline={m.analytics_food_sleep_headline()}
		confidence={confidence()}
		sampleSize={sampleSize()}
		borderColor="border-purple-500"
	>
		{#snippet children()}
			{@const better = betterSleep()}
			{@const worse = worseSleep()}
			{#if better.length > 0 || worse.length > 0}
				<div class="space-y-3">
					{#if better.length > 0}
						<div>
							<p class="text-xs font-medium text-green-600 dark:text-green-400 mb-1.5">
								{m.analytics_food_sleep_helps()}
							</p>
							<div class="flex flex-wrap gap-1.5">
								{#each better as food (food.foodId)}
									<span
										class="rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2.5 py-0.5 text-xs font-medium"
									>
										{food.foodName}
										<span class="opacity-70">(+{food.delta.toFixed(1)})</span>
									</span>
								{/each}
							</div>
						</div>
					{/if}
					{#if worse.length > 0}
						<div>
							<p class="text-xs font-medium text-red-600 dark:text-red-400 mb-1.5">
								{m.analytics_food_sleep_hurts()}
							</p>
							<div class="flex flex-wrap gap-1.5">
								{#each worse as food (food.foodId)}
									<span
										class="rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2.5 py-0.5 text-xs font-medium"
									>
										{food.foodName}
										<span class="opacity-70">({food.delta.toFixed(1)})</span>
									</span>
								{/each}
							</div>
						</div>
					{/if}
					<p class="text-[11px] text-muted-foreground">{m.analytics_correlation_disclaimer()}</p>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
