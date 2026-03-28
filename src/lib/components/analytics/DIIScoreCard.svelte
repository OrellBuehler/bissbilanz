<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeDIIScore } from '$lib/analytics/food-quality';
	import * as m from '$lib/paraglide/messages';

	type NutrientEntry = {
		date: string;
		fiber?: number | null;
		omega3?: number | null;
		vitaminC?: number | null;
		vitaminD?: number | null;
		vitaminE?: number | null;
		saturatedFat?: number | null;
		transFat?: number | null;
		alcohol?: number | null;
		caffeine?: number | null;
		sodium?: number | null;
	};

	let {
		nutrientEntries,
		loading
	}: {
		nutrientEntries: NutrientEntry[];
		loading: boolean;
	} = $props();

	type DailyAggregate = {
		date: string;
		fiber: number;
		omega3: number;
		vitaminC: number;
		vitaminD: number;
		vitaminE: number;
		saturatedFat: number;
		transFat: number;
		alcohol: number;
		caffeine: number;
		sodium: number;
	};

	const dailyAggregates = $derived.by(() => {
		const byDate = new Map<string, DailyAggregate>();
		for (const entry of nutrientEntries) {
			if (!byDate.has(entry.date)) {
				byDate.set(entry.date, {
					date: entry.date,
					fiber: 0,
					omega3: 0,
					vitaminC: 0,
					vitaminD: 0,
					vitaminE: 0,
					saturatedFat: 0,
					transFat: 0,
					alcohol: 0,
					caffeine: 0,
					sodium: 0
				});
			}
			const day = byDate.get(entry.date)!;
			day.fiber += entry.fiber ?? 0;
			day.omega3 += entry.omega3 ?? 0;
			day.vitaminC += entry.vitaminC ?? 0;
			day.vitaminD += entry.vitaminD ?? 0;
			day.vitaminE += entry.vitaminE ?? 0;
			day.saturatedFat += entry.saturatedFat ?? 0;
			day.transFat += entry.transFat ?? 0;
			day.alcohol += entry.alcohol ?? 0;
			day.caffeine += entry.caffeine ?? 0;
			day.sodium += entry.sodium ?? 0;
		}
		return [...byDate.values()];
	});

	const result = $derived.by(() => {
		if (dailyAggregates.length === 0) return null;
		return computeDIIScore(dailyAggregates);
	});

	const classLabel = $derived.by(() => {
		const c = result?.classification;
		if (c === 'anti-inflammatory') return m.analytics_dii_anti();
		if (c === 'neutral') return m.analytics_dii_neutral();
		return m.analytics_dii_pro();
	});

	const classColor = $derived.by(() => {
		const c = result?.classification;
		if (c === 'anti-inflammatory')
			return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
		if (c === 'neutral') return 'bg-muted text-muted-foreground';
		return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-rose-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_dii()}
		headline={m.analytics_dii_headline({
			score: (Math.round((result?.score ?? 0) * 10) / 10).toFixed(1)
		})}
		confidence={result?.confidence ?? 'insufficient'}
		sampleSize={result?.sampleSize ?? 0}
		borderColor="border-rose-500"
	>
		{#snippet children()}
			{#if result}
				<div class="space-y-3">
					<span class="rounded-full px-2 py-0.5 text-[11px] font-medium {classColor}">
						{classLabel}
					</span>
					{#if result.contributors.length > 0}
						<div>
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
								{m.analytics_dii_contributors()}
							</p>
							<div class="space-y-1">
								{#each result.contributors.slice(0, 3) as c (c.nutrient)}
									<div class="flex items-center justify-between text-xs">
										<span class="text-muted-foreground capitalize">{c.nutrient}</span>
										<span
											class="tabular-nums font-medium {c.impact < 0
												? 'text-green-600 dark:text-green-400'
												: 'text-red-600 dark:text-red-400'}"
										>
											{c.impact > 0 ? '+' : ''}{(Math.round(c.impact * 100) / 100).toFixed(2)}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
