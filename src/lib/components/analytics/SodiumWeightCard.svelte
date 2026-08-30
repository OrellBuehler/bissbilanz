<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeSodiumWeightCorrelation } from '$lib/analytics/sodium-weight';
	import { aggregateEntriesByDay } from '$lib/analytics/daily-coverage';
	import * as m from '$lib/paraglide/messages';
	import type { WeightFoodPoint } from './types';

	type NutrientEntry = {
		date: string;
		calories: number;
		sodium: number | null;
		[key: string]: unknown;
	};

	let {
		weightFoodData,
		nutrientData,
		loading
	}: {
		weightFoodData: WeightFoodPoint[];
		nutrientData: NutrientEntry[];
		loading: boolean;
	} = $props();

	const sodiumResult = $derived.by(() => {
		if (weightFoodData.length === 0 || nutrientData.length === 0) return null;

		const dailyNutrients = aggregateEntriesByDay(nutrientData, ['sodium'] as const)
			.filter((day) => day.values.sodium !== null)
			.map((day) => ({
				date: day.date,
				sodium: day.values.sodium as number,
				coverage: day.coverage.sodium
			}));
		const weightSeries = weightFoodData.map((d) => ({ date: d.date, weightKg: d.weightKg }));

		return computeSodiumWeightCorrelation(dailyNutrients, weightSeries);
	});

	const headline = $derived.by(() => {
		const r = sodiumResult;
		if (!r || r.confidence === 'insufficient') return m.analytics_sodium_no_pattern();
		if (r.avgWeightDeltaAfterHighSodium === null) return m.analytics_sodium_no_pattern();
		const delta = r.avgWeightDeltaAfterHighSodium;
		const sign = delta >= 0 ? '+' : '';
		return m.analytics_sodium_headline({ delta: `${sign}${delta.toFixed(2)}` });
	});

	const formatSodium = (mg: number) => {
		if (mg >= 1000) return `${(mg / 1000).toFixed(1)}g`;
		return `${Math.round(mg)}mg`;
	};
</script>

<InsightCard
	{loading}
	title={m.analytics_sodium()}
	{headline}
	confidence={sodiumResult?.confidence ?? 'insufficient'}
	sampleSize={sodiumResult?.sampleSize ?? 0}
	borderColor="border-yellow-500"
>
	{#snippet children()}
		{#if sodiumResult && sodiumResult.confidence !== 'insufficient'}
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-xs text-muted-foreground">{m.analytics_sodium_avg()}</span>
					<span class="text-sm font-semibold tabular-nums">
						{formatSodium(sodiumResult.avgSodium)}
					</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-xs text-muted-foreground">{m.analytics_sodium_high_days()}</span>
					<span class="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
						{sodiumResult.highSodiumDays}
					</span>
				</div>
				{#if sodiumResult.avgWeightDeltaAfterHighSodium !== null}
					<div class="flex items-center justify-between border-t pt-2">
						<span class="text-xs text-muted-foreground">{m.analytics_sodium_delta()}</span>
						<span
							class="text-sm font-semibold tabular-nums {sodiumResult.avgWeightDeltaAfterHighSodium >
							0
								? 'text-red-600 dark:text-red-400'
								: 'text-green-600 dark:text-green-400'}"
						>
							{sodiumResult.avgWeightDeltaAfterHighSodium >= 0
								? '+'
								: ''}{sodiumResult.avgWeightDeltaAfterHighSodium.toFixed(2)} kg
						</span>
					</div>
				{/if}
				{#if sodiumResult.correlation.pValue !== null && sodiumResult.correlation.ciLow !== null && sodiumResult.correlation.ciHigh !== null}
					<p class="text-[11px] text-muted-foreground tabular-nums">
						r = {sodiumResult.correlation.r.toFixed(2)} ·
						{m.analytics_ci95({
							low: sodiumResult.correlation.ciLow.toFixed(2),
							high: sodiumResult.correlation.ciHigh.toFixed(2)
						})} · {m.analytics_p_value({ p: sodiumResult.correlation.pValue.toFixed(3) })}
					</p>
				{/if}
				<p class="text-[11px] text-muted-foreground">{m.analytics_correlation_disclaimer()}</p>
			</div>
		{/if}
	{/snippet}
</InsightCard>
