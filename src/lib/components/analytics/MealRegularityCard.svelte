<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeMealRegularity } from '$lib/analytics/meal-regularity';
	import * as m from '$lib/paraglide/messages';

	type MealEntry = {
		date: string;
		mealType: string;
		eatenAt: string | null;
	};

	let {
		mealEntries,
		loading
	}: {
		mealEntries: MealEntry[];
		loading: boolean;
	} = $props();

	const result = $derived.by(() => {
		if (mealEntries.length === 0) return null;
		return computeMealRegularity(mealEntries);
	});

	const regularityLabel = (r: 'high' | 'medium' | 'low') => {
		if (r === 'high') return m.analytics_regularity_high();
		if (r === 'medium') return m.analytics_regularity_medium();
		return m.analytics_regularity_low();
	};

	const regularityColor = (r: 'high' | 'medium' | 'low') => {
		if (r === 'high') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
		if (r === 'medium')
			return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
		return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
	};

	const formatTime = (avgMinute: number) => {
		const h = Math.floor(avgMinute / 60);
		const min = Math.round(avgMinute % 60);
		return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
	};
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-violet-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_regularity()}
		headline={m.analytics_regularity_headline({
			score: Math.round(result?.overallScore ?? 0).toString()
		})}
		confidence={result?.confidence ?? 'insufficient'}
		sampleSize={result?.sampleSize ?? 0}
		borderColor="border-violet-500"
	>
		{#snippet children()}
			{#if result && result.meals.length > 0}
				<div class="space-y-2">
					{#each result.meals as meal (meal.mealType)}
						<div class="flex items-center justify-between gap-2">
							<span class="text-xs text-muted-foreground truncate">{meal.mealType}</span>
							<div class="flex items-center gap-2">
								<span class="text-xs tabular-nums text-muted-foreground"
									>{formatTime(meal.avgMinute)}</span
								>
								<span
									class="rounded-full px-1.5 py-0.5 text-[10px] font-medium {regularityColor(
										meal.regularity
									)}"
								>
									{regularityLabel(meal.regularity)}
								</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
