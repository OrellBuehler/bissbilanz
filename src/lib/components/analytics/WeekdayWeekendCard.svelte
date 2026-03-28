<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeWeekdayWeekendSplit } from '$lib/analytics/weekday-weekend';
	import * as m from '$lib/paraglide/messages';

	type NutrientEntry = {
		date: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	};

	let {
		nutrientEntries,
		loading
	}: {
		nutrientEntries: NutrientEntry[];
		loading: boolean;
	} = $props();

	const dailyAggregates = $derived.by(() => {
		const byDate = new Map<string, NutrientEntry>();
		for (const entry of nutrientEntries) {
			if (!byDate.has(entry.date)) {
				byDate.set(entry.date, {
					date: entry.date,
					calories: 0,
					protein: 0,
					carbs: 0,
					fat: 0,
					fiber: 0
				});
			}
			const day = byDate.get(entry.date)!;
			day.calories += entry.calories;
			day.protein += entry.protein;
			day.carbs += entry.carbs;
			day.fat += entry.fat;
			day.fiber += entry.fiber;
		}
		return [...byDate.values()];
	});

	const result = $derived.by(() => {
		if (dailyAggregates.length === 0) return null;
		return computeWeekdayWeekendSplit(dailyAggregates);
	});

	const deltaAbsPct = $derived.by(() => Math.abs(result?.calorieDeltaPct ?? 0));
	const deltaColor = $derived.by(() =>
		deltaAbsPct > 10 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
	);
	const deltaSign = $derived.by(() => ((result?.calorieDelta ?? 0) > 0 ? '+' : ''));
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-purple-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_weekday_weekend()}
		headline={m.analytics_weekday_weekend_headline({
			delta: Math.abs(Math.round(result?.calorieDelta ?? 0)).toString()
		})}
		confidence={result?.confidence ?? 'insufficient'}
		sampleSize={result?.sampleSize ?? 0}
		borderColor="border-purple-500"
	>
		{#snippet children()}
			{#if result}
				<div class="space-y-3">
					<div class="grid grid-cols-2 gap-3">
						<div class="rounded-lg border p-3">
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
								{m.analytics_weekday_label()}
							</p>
							<p class="text-base font-bold tabular-nums">
								{Math.round(result.weekday.avgCalories)}
							</p>
							<p class="text-[10px] text-muted-foreground">kcal · {result.weekday.days}d</p>
						</div>
						<div class="rounded-lg border p-3">
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
								{m.analytics_weekend_label()}
							</p>
							<p class="text-base font-bold tabular-nums">
								{Math.round(result.weekend.avgCalories)}
							</p>
							<p class="text-[10px] text-muted-foreground">kcal · {result.weekend.days}d</p>
						</div>
					</div>
					<p class="text-xs {deltaColor} font-medium tabular-nums">
						{deltaSign}{Math.round(result.calorieDelta)} kcal ({deltaSign}{Math.round(
							result.calorieDeltaPct
						)}%)
					</p>
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
