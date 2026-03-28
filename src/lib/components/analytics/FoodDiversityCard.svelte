<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeFoodDiversity } from '$lib/analytics/food-diversity';
	import * as m from '$lib/paraglide/messages';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import TrendingDown from '@lucide/svelte/icons/trending-down';
	import Minus from '@lucide/svelte/icons/minus';

	type DiversityEntry = {
		date: string;
		foodId: string | null;
		recipeId: string | null;
		foodName: string;
	};

	let {
		diversityData,
		loading
	}: {
		diversityData: DiversityEntry[];
		loading: boolean;
	} = $props();

	const result = $derived.by(() => {
		if (diversityData.length === 0) return null;
		return computeFoodDiversity(diversityData);
	});

	const trendLabel = $derived.by(() => {
		const t = result?.trend;
		if (t === 'increasing') return m.analytics_diversity_trend_increasing();
		if (t === 'decreasing') return m.analytics_diversity_trend_decreasing();
		return m.analytics_diversity_trend_stable();
	});

	const trendColor = $derived.by(() => {
		const t = result?.trend;
		if (t === 'increasing') return 'text-green-600 dark:text-green-400';
		if (t === 'decreasing') return 'text-red-600 dark:text-red-400';
		return 'text-muted-foreground';
	});

	const maxWeeklyCount = $derived.by(() => {
		if (!result || result.weeklyData.length === 0) return 1;
		return Math.max(...result.weeklyData.map((w) => w.uniqueCount), 1);
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-teal-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_diversity()}
		headline={m.analytics_diversity_headline({
			count: Math.round(result?.avgUniqueFoodsPerWeek ?? 0).toString()
		})}
		confidence={result?.confidence ?? 'insufficient'}
		sampleSize={result?.sampleSize ?? 0}
		borderColor="border-teal-500"
	>
		{#snippet children()}
			{#if result}
				<div class="space-y-3">
					<div class="grid grid-cols-2 gap-3">
						<div>
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide">
								{m.analytics_diversity_current()}
							</p>
							<p class="text-base font-bold tabular-nums">{result.currentWeekUnique}</p>
						</div>
						<div>
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide">Trend</p>
							<div class="flex items-center gap-1 {trendColor}">
								{#if result.trend === 'increasing'}
									<TrendingUp class="size-3.5" />
								{:else if result.trend === 'decreasing'}
									<TrendingDown class="size-3.5" />
								{:else}
									<Minus class="size-3.5" />
								{/if}
								<span class="text-xs font-medium">{trendLabel}</span>
							</div>
						</div>
					</div>
					{#if result.weeklyData.length > 0}
						<div class="flex items-end gap-0.5 h-8">
							{#each result.weeklyData.slice(-12) as week (week.weekStart)}
								<div
									class="flex-1 bg-teal-400/60 dark:bg-teal-600/40 rounded-t"
									style="height: {(week.uniqueCount / maxWeeklyCount) * 100}%"
									title="{week.weekStart}: {week.uniqueCount}"
								></div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
