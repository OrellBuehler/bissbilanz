<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeCalorieCycling } from '$lib/analytics/calorie-patterns';
	import * as m from '$lib/paraglide/messages';

	type NutrientEntry = {
		date: string;
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
		const byDate = new Map<string, { date: string; calories: number }>();
		for (const entry of nutrientEntries) {
			if (!byDate.has(entry.date)) byDate.set(entry.date, { date: entry.date, calories: 0 });
			byDate.get(entry.date)!.calories += entry.calories;
		}
		return [...byDate.values()];
	});

	const result = $derived.by(() => {
		if (dailyAggregates.length === 0) return null;
		return computeCalorieCycling(dailyAggregates);
	});

	const patternLabel = $derived.by(() => {
		const p = result?.pattern;
		if (p === 'consistent') return m.analytics_cycling_consistent();
		if (p === 'moderate') return m.analytics_cycling_moderate();
		return m.analytics_cycling_high_variance();
	});

	const patternColor = $derived.by(() => {
		const p = result?.pattern;
		if (p === 'consistent')
			return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
		if (p === 'moderate')
			return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
		return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-cyan-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_cycling()}
		headline={m.analytics_cycling_headline({ pattern: patternLabel })}
		confidence={result?.confidence ?? 'insufficient'}
		sampleSize={result?.sampleSize ?? 0}
		borderColor="border-cyan-500"
	>
		{#snippet children()}
			{#if result}
				<div class="space-y-3">
					<span class="rounded-full px-2 py-0.5 text-[11px] font-medium {patternColor}">
						{patternLabel}
					</span>
					<div class="grid grid-cols-3 gap-3">
						<div>
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide">
								{m.analytics_cycling_cv()}
							</p>
							<p class="text-sm font-semibold tabular-nums">{Math.round(result.cv)}%</p>
						</div>
						<div>
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide">
								{m.analytics_cycling_high_days()}
							</p>
							<p class="text-sm font-semibold tabular-nums">{result.highDays}</p>
						</div>
						<div>
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide">
								{m.analytics_cycling_low_days()}
							</p>
							<p class="text-sm font-semibold tabular-nums">{result.lowDays}</p>
						</div>
					</div>
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
