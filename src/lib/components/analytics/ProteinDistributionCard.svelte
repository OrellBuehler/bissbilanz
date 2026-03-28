<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeProteinDistribution } from '$lib/analytics/protein-distribution';
	import * as m from '$lib/paraglide/messages';

	type NutrientEntry = {
		date: string;
		mealType: string;
		protein: number;
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
		return computeProteinDistribution(nutrientEntries);
	});

	const scoreWidth = $derived.by(() => Math.min(100, Math.max(0, result?.score ?? 0)));

	const scoreColor = $derived.by(() => {
		const s = result?.score ?? 0;
		if (s >= 70) return 'bg-green-500';
		if (s >= 40) return 'bg-yellow-500';
		return 'bg-red-500';
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-red-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_protein_dist()}
		headline={m.analytics_protein_dist_headline({
			score: Math.round(result?.score ?? 0).toString()
		})}
		confidence={result?.confidence ?? 'insufficient'}
		sampleSize={result?.sampleSize ?? 0}
		borderColor="border-red-500"
	>
		{#snippet children()}
			{#if result}
				<div class="space-y-3">
					<div class="space-y-1">
						<div class="h-2.5 bg-muted/40 rounded-full overflow-hidden">
							<div
								class="h-full rounded-full {scoreColor} transition-all"
								style="width: {scoreWidth}%"
							></div>
						</div>
						<div class="flex justify-between text-[10px] text-muted-foreground tabular-nums">
							<span>0</span>
							<span>100</span>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide">
								{m.analytics_protein_dist_avg()}
							</p>
							<p class="text-sm font-semibold tabular-nums">
								{(Math.round(result.avgPerMeal * 10) / 10).toFixed(1)}g
							</p>
						</div>
						<div>
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide">
								{m.analytics_protein_dist_below({
									count: result.mealsBelowThreshold.toString(),
									threshold: '20'
								})}
							</p>
							<p class="text-sm font-semibold tabular-nums">
								{result.mealsBelowThreshold}/{result.totalMeals}
							</p>
						</div>
					</div>
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
