<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeAdaptiveTDEE, detectPlateau } from '$lib/analytics/tdee';
	import * as m from '$lib/paraglide/messages';
	import type { WeightFoodPoint } from './types';

	let {
		weightFoodData,
		loading
	}: {
		weightFoodData: WeightFoodPoint[];
		loading: boolean;
	} = $props();

	const plateau = $derived.by(() => {
		if (weightFoodData.length === 0) return null;
		const weightSeries = weightFoodData.map((d) => ({ date: d.date, weightKg: d.weightKg }));
		const calorieSeries = weightFoodData.map((d) => ({ date: d.date, calories: d.calories }));
		const tdee = computeAdaptiveTDEE(weightSeries, calorieSeries, 14);
		return detectPlateau(weightSeries, calorieSeries, tdee.estimatedTDEE);
	});

	const headline = $derived.by(() => {
		const p = plateau;
		if (!p || !p.isPlateaued) return m.analytics_plateau_none();
		return m.analytics_plateau_detected({ days: p.plateauDays.toString() });
	});
</script>

<InsightCard
	{loading}
	title={m.analytics_plateau()}
	{headline}
	confidence={plateau?.confidence ?? 'insufficient'}
	sampleSize={plateau?.sampleSize ?? 0}
	borderColor="border-amber-500"
>
	{#snippet children()}
		{#if plateau}
			<div class="space-y-3">
				{#if plateau.isPlateaued}
					<div class="flex items-center gap-2">
						<span
							class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
						>
							{m.analytics_plateau_detected({ days: plateau.plateauDays.toString() })}
						</span>
					</div>

					{#if plateau.cause === 'intake_variance'}
						<p class="text-sm text-foreground">{m.analytics_plateau_cause_variance()}</p>
					{/if}

					{#if plateau.estimatedDeficit !== null}
						<div class="flex items-center justify-between border-t pt-2">
							<span class="text-xs text-muted-foreground">{m.analytics_plateau_deficit()}</span>
							<span class="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
								{Math.round(plateau.estimatedDeficit)} kcal
							</span>
						</div>
					{/if}

					<p class="text-[11px] text-muted-foreground">{m.analytics_plateau_span_note()}</p>
				{:else}
					<div class="flex items-center gap-2">
						<span
							class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
						>
							{m.analytics_plateau_none()}
						</span>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
</InsightCard>
