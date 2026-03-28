<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeAdaptiveTDEE, detectPlateau } from '$lib/analytics/tdee';
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

	const sodiumAvg = $derived.by(() => {
		const byDate = new Map<string, number>();
		for (const entry of nutrientData) {
			if (entry.sodium === null) continue;
			const prev = byDate.get(entry.date) ?? 0;
			byDate.set(entry.date, prev + entry.sodium);
		}
		const days = [...byDate.values()];
		if (days.length === 0) return null;
		return days.reduce((s, v) => s + v, 0) / days.length;
	});

	const plateau = $derived.by(() => {
		if (weightFoodData.length === 0) return null;
		const weightSeries = weightFoodData.map((d) => ({ date: d.date, weightKg: d.weightKg }));
		const calorieSeries = weightFoodData.map((d) => ({ date: d.date, calories: d.calories }));
		const tdee = computeAdaptiveTDEE(weightSeries, calorieSeries, 14);
		return detectPlateau(weightSeries, calorieSeries, tdee.estimatedTDEE, sodiumAvg);
	});

	const headline = $derived.by(() => {
		const p = plateau;
		if (!p) return m.analytics_plateau_none();
		if (!p.isPlateaued) return m.analytics_plateau_none();
		return m.analytics_plateau_detected({ days: p.plateauDays.toString() });
	});

	const causeText = $derived.by(() => {
		const p = plateau;
		if (!p || !p.isPlateaued) return null;
		if (p.cause === 'adaptive_metabolism') return m.analytics_plateau_cause_metabolism();
		if (p.cause === 'intake_variance') return m.analytics_plateau_cause_variance();
		if (p.cause === 'water_retention') return m.analytics_plateau_cause_water();
		return null;
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-amber-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
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

						{#if causeText}
							<p class="text-sm text-foreground">{causeText}</p>
						{/if}

						{#if plateau.estimatedDeficit !== null}
							<div class="flex items-center justify-between border-t pt-2">
								<span class="text-xs text-muted-foreground">{m.analytics_plateau_deficit()}</span>
								<span class="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
									{Math.round(plateau.estimatedDeficit)} kcal
								</span>
							</div>
						{/if}
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
{/if}
