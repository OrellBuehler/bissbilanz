<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { extractMealTimingPatterns } from '$lib/analytics/meal-timing';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import * as m from '$lib/paraglide/messages';
	import type { MealEntry } from './types';

	type Props = {
		mealTimingData: MealEntry[];
		loading: boolean;
	};

	let { mealTimingData, loading }: Props = $props();

	const analysis = $derived.by(() => {
		if (mealTimingData.length === 0) return null;
		return extractMealTimingPatterns(mealTimingData);
	});

	const hourlyData = $derived.by(() => {
		const a = analysis;
		if (!a) return [];
		const max = Math.max(...a.hourlyDistribution, 1);
		return a.hourlyDistribution.map((count, hour) => ({
			hour,
			count,
			pct: (count / max) * 100,
			isPeak: count >= max * 0.7
		}));
	});

	const peakHours = $derived.by(() =>
		hourlyData
			.filter((h) => h.isPeak && h.count > 0)
			.map((h) => {
				const d = new Date(2000, 0, 1, h.hour);
				return d.toLocaleTimeString(undefined, { hour: 'numeric' });
			})
	);

	const sampleSize = $derived.by(() => analysis?.dailyWindows.length ?? 0);
	const confidence = $derived.by(() => getConfidenceLevel(sampleSize));
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-amber-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_meal_spacing()}
		headline={m.analytics_meal_spacing_headline()}
		{confidence}
		{sampleSize}
		borderColor="border-amber-500"
	>
		{#snippet children()}
			{@const hours = hourlyData}
			{#if hours.some((h) => h.count > 0)}
				<div class="space-y-2">
					<div class="space-y-0.5">
						{#each hours.filter((h) => h.count > 0) as h (h.hour)}
							{@const d = new Date(2000, 0, 1, h.hour)}
							{@const displayHour = d.toLocaleTimeString(undefined, { hour: 'numeric' })}
							<div class="flex items-center gap-2">
								<span class="w-10 shrink-0 text-[10px] tabular-nums text-muted-foreground">
									{displayHour}
								</span>
								<div class="relative flex-1 h-4 bg-muted/40 rounded overflow-hidden">
									<div
										class="h-full rounded transition-all {h.isPeak
											? 'bg-amber-500'
											: 'bg-amber-300/60 dark:bg-amber-700/40'}"
										style="width: {h.pct}%"
									></div>
								</div>
								<span
									class="w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground"
								>
									{h.count}
								</span>
							</div>
						{/each}
					</div>
					{#if peakHours.length > 0}
						<p class="text-xs text-muted-foreground">
							{m.analytics_peak_times()}
							<span class="font-medium text-foreground">{peakHours.join(', ')}</span>
						</p>
					{/if}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
