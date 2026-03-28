<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeSodiumWeightCorrelation } from '$lib/analytics/sodium-weight';
	import * as m from '$lib/paraglide/messages';

	type WeightFoodPoint = {
		date: string;
		calories: number | null;
		weightKg: number | null;
		movingAvg: number | null;
	};

	type NutrientEntry = {
		date: string;
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

		const byDate = new Map<string, number>();
		for (const entry of nutrientData) {
			if (entry.sodium === null) continue;
			const prev = byDate.get(entry.date) ?? 0;
			byDate.set(entry.date, prev + entry.sodium);
		}
		const dailyNutrients = [...byDate.entries()].map(([date, sodium]) => ({ date, sodium }));
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

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-yellow-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
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
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
