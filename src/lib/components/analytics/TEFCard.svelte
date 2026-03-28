<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeTEF } from '$lib/analytics/food-quality';
	import * as m from '$lib/paraglide/messages';

	type NutrientEntry = {
		date: string;
		protein: number;
		carbs: number;
		fat: number;
		calories: number;
	};

	let {
		nutrientEntries,
		loading
	}: {
		nutrientEntries: NutrientEntry[];
		loading: boolean;
	} = $props();

	const dailyAggregates = $derived.by(() => {
		const byDate = new Map<
			string,
			{ date: string; protein: number; carbs: number; fat: number; calories: number }
		>();
		for (const entry of nutrientEntries) {
			if (!byDate.has(entry.date)) {
				byDate.set(entry.date, { date: entry.date, protein: 0, carbs: 0, fat: 0, calories: 0 });
			}
			const day = byDate.get(entry.date)!;
			day.protein += entry.protein;
			day.carbs += entry.carbs;
			day.fat += entry.fat;
			day.calories += entry.calories;
		}
		return [...byDate.values()];
	});

	const result = $derived.by(() => {
		if (dailyAggregates.length === 0) return null;
		return computeTEF(dailyAggregates);
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-indigo-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_tef()}
		headline={m.analytics_tef_headline({ kcal: Math.round(result?.avgDailyTEF ?? 0).toString() })}
		confidence={result?.confidence ?? 'insufficient'}
		sampleSize={result?.sampleSize ?? 0}
		borderColor="border-indigo-500"
	>
		{#snippet children()}
			{#if result}
				<p class="text-sm text-muted-foreground">
					{m.analytics_tef_pct({ pct: (Math.round(result.avgTEFPercent * 10) / 10).toFixed(1) })}
				</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
