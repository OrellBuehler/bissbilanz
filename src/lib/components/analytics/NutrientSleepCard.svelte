<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeNutrientOutcomeCorrelations } from '$lib/analytics/nutrient-correlation';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import { RDA_VALUES } from '$lib/analytics/rda';
	import * as m from '$lib/paraglide/messages';
	import type { DailyNutrient } from './types';

	type SleepFoodPoint = {
		date: string;
		eveningCalories: number | null;
		sleepDurationMinutes: number | null;
		sleepQuality: number | null;
	};

	let {
		sleepFoodData = [],
		nutrientSeries = [],
		loading = false
	}: {
		sleepFoodData: SleepFoodPoint[];
		nutrientSeries: DailyNutrient[];
		loading?: boolean;
	} = $props();

	const CORE_NUTRIENT_RDAS: typeof RDA_VALUES = [
		{ nutrientKey: 'calories', unit: 'kcal', label: 'Calories' },
		{ nutrientKey: 'protein', unit: 'g', label: 'Protein' },
		{ nutrientKey: 'carbs', unit: 'g', label: 'Carbs' },
		{ nutrientKey: 'fat', unit: 'g', label: 'Fat' }
	].map((core) => ({
		...core,
		rdaMale: 0,
		rdaFemale: 0,
		earMale: null,
		earFemale: null,
		referenceType: 'ai' as const,
		per1000Kcal: null
	}));

	const availableRdas = $derived.by(() => {
		if (nutrientSeries.length === 0) return [];
		const sample = nutrientSeries[0];
		const allRdas = [...CORE_NUTRIENT_RDAS, ...RDA_VALUES];
		return allRdas.filter(
			(rda) => sample[rda.nutrientKey] !== undefined && sample[rda.nutrientKey] !== null
		);
	});

	const correlations = $derived.by(() => {
		if (sleepFoodData.length === 0 || nutrientSeries.length === 0) return [];

		const sleepOutcomes = sleepFoodData
			.filter((d) => d.sleepQuality !== null)
			.map((d) => ({ date: d.date, value: d.sleepQuality as number }));

		if (sleepOutcomes.length < 7) return [];

		const rdas = availableRdas;
		const dailyNutrients = nutrientSeries.map((d) => ({
			date: d.date,
			nutrients: Object.fromEntries(
				rdas.map((rda) => [
					rda.nutrientKey,
					(d[rda.nutrientKey] as number | null | undefined) ?? null
				])
			) as Record<string, number | null>
		}));

		return computeNutrientOutcomeCorrelations(dailyNutrients, sleepOutcomes, 0).slice(0, 8);
	});

	const sampleSize = $derived.by(() => sleepFoodData.filter((d) => d.sleepQuality !== null).length);
	const confidence = $derived.by(() => getConfidenceLevel(sampleSize));

	const maxAbsR = $derived.by(() => {
		const corrs = correlations;
		if (corrs.length === 0) return 0;
		return Math.max(...corrs.map((c) => Math.abs(c.correlation.r)));
	});
</script>

<InsightCard
	{loading}
	title={m.analytics_nutrient_sleep()}
	headline={m.analytics_nutrient_sleep_headline()}
	{confidence}
	{sampleSize}
	borderColor="border-purple-500"
>
	{#snippet children()}
		{@const corrs = correlations}
		{@const maxR = maxAbsR}
		{#if corrs.length > 0}
			<div class="space-y-2">
				{#each corrs as nc (nc.nutrientKey)}
					{@const rda = availableRdas.find((r) => r.nutrientKey === nc.nutrientKey)}
					{@const label = rda?.label ?? nc.nutrientKey}
					{@const absR = Math.abs(nc.correlation.r)}
					{@const barPct = maxR > 0 ? (absR / maxR) * 100 : 0}
					{@const isPositive = nc.correlation.r >= 0}
					<div class="flex items-center gap-2">
						<span class="w-28 shrink-0 text-xs truncate text-muted-foreground">
							{label}
						</span>
						<div class="relative flex-1 h-4 bg-muted/40 rounded overflow-hidden">
							<div
								class="h-full rounded transition-all {isPositive
									? 'bg-green-400/70 dark:bg-green-600/50'
									: 'bg-red-400/70 dark:bg-red-600/50'}"
								style="width: {barPct}%"
							></div>
						</div>
						<span
							class="w-12 shrink-0 text-right text-xs tabular-nums font-medium {isPositive
								? 'text-green-600 dark:text-green-400'
								: 'text-red-600 dark:text-red-400'}"
						>
							{nc.correlation.r > 0 ? '+' : ''}{nc.correlation.r.toFixed(2)}
						</span>
					</div>
				{/each}
				<p class="text-[11px] text-muted-foreground pt-1">
					{m.analytics_screened({ n: corrs[0].comparisons.toString() })} · {m.analytics_correlation_disclaimer()}
				</p>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
		{/if}
	{/snippet}
</InsightCard>
