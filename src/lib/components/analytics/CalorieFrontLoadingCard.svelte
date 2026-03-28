<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeCalorieFrontLoading } from '$lib/analytics/calorie-patterns';
	import * as m from '$lib/paraglide/messages';

	type NutrientEntry = {
		date: string;
		eatenAt: string | null;
		calories: number;
	};

	let {
		nutrientEntries,
		loading
	}: {
		nutrientEntries: NutrientEntry[];
		loading: boolean;
	} = $props();

	const result = $derived.by(() => {
		if (nutrientEntries.length === 0) return null;
		return computeCalorieFrontLoading(nutrientEntries);
	});

	const morningColor = $derived.by(() => {
		const pct = result?.avgMorningPct ?? 0;
		return pct >= 50 ? 'bg-green-500' : 'bg-amber-500';
	});

	const morningTextColor = $derived.by(() => {
		const pct = result?.avgMorningPct ?? 0;
		return pct >= 50 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400';
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-orange-400 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_front_loading()}
		headline={m.analytics_front_loading_headline({
			pct: Math.round(result?.avgMorningPct ?? 0).toString()
		})}
		confidence={result?.confidence ?? 'insufficient'}
		sampleSize={result?.sampleSize ?? 0}
		borderColor="border-orange-400"
	>
		{#snippet children()}
			{#if result}
				<div class="space-y-3">
					<div class="space-y-1">
						<div class="h-3 bg-muted/40 rounded-full overflow-hidden">
							<div
								class="h-full rounded-full {morningColor} transition-all"
								style="width: {Math.min(100, result.avgMorningPct)}%"
							></div>
						</div>
						<p class="text-xs {morningTextColor} font-medium tabular-nums">
							{Math.round(result.avgMorningPct)}% before 14:00
						</p>
					</div>
					<p class="text-xs text-muted-foreground">
						{m.analytics_front_loading_days({
							count: result.daysAbove50Pct.toString(),
							total: result.totalDays.toString()
						})}
					</p>
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
