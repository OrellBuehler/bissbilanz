<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeNOVAScore } from '$lib/analytics/food-quality';
	import * as m from '$lib/paraglide/messages';

	type NutrientEntry = {
		calories: number;
		novaGroup: number | null;
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
		return computeNOVAScore(nutrientEntries);
	});

	const groupColors: Record<number, string> = {
		1: 'bg-green-500',
		2: 'bg-blue-500',
		3: 'bg-yellow-500',
		4: 'bg-red-500'
	};

	const groupLabels = [
		m.analytics_nova_group1,
		m.analytics_nova_group2,
		m.analytics_nova_group3,
		m.analytics_nova_group4
	];
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-orange-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_nova()}
		headline={m.analytics_nova_headline({
			pct: Math.round(result?.ultraProcessedPct ?? 0).toString()
		})}
		confidence={result?.confidence ?? 'insufficient'}
		sampleSize={result?.sampleSize ?? 0}
		borderColor="border-orange-500"
	>
		{#snippet children()}
			{#if result}
				<div class="space-y-3">
					<div class="space-y-2">
						{#each result.byGroup as group (group.group)}
							<div class="space-y-0.5">
								<div class="flex justify-between text-xs">
									<span class="text-muted-foreground">{groupLabels[group.group - 1]()}</span>
									<span class="tabular-nums font-medium">{Math.round(group.pct)}%</span>
								</div>
								<div class="h-2 bg-muted/40 rounded-full overflow-hidden">
									<div
										class="h-full rounded-full {groupColors[group.group] ?? 'bg-muted'}"
										style="width: {Math.max(group.pct, 0)}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
					<p class="text-xs text-muted-foreground">
						{m.analytics_nova_coverage({ pct: Math.round(result.coveragePct).toString() })}
					</p>
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
