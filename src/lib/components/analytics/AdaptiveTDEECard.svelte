<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeAdaptiveTDEE } from '$lib/analytics/tdee';
	import * as m from '$lib/paraglide/messages';
	import type { WeightFoodPoint } from './types';

	let {
		weightFoodData,
		loading
	}: {
		weightFoodData: WeightFoodPoint[];
		loading: boolean;
	} = $props();

	const tdee = $derived.by(() => {
		if (weightFoodData.length === 0) return null;
		const weightSeries = weightFoodData.map((d) => ({ date: d.date, weightKg: d.weightKg }));
		const calorieSeries = weightFoodData.map((d) => ({ date: d.date, calories: d.calories }));
		return computeAdaptiveTDEE(weightSeries, calorieSeries, 14);
	});

	const headline = $derived.by(() => {
		const t = tdee;
		if (!t || t.estimatedTDEE === null) return m.analytics_tdee_no_data();
		return m.analytics_tdee_headline({ kcal: Math.round(t.estimatedTDEE).toString() });
	});

	const trendArrow = $derived.by(() => {
		const t = tdee;
		if (!t) return '→';
		if (t.trend === 'loss') return '↓';
		if (t.trend === 'gain') return '↑';
		return '→';
	});

	const trendColor = $derived.by(() => {
		const t = tdee;
		if (!t) return 'text-muted-foreground';
		if (t.trend === 'loss') return 'text-green-600 dark:text-green-400';
		if (t.trend === 'gain') return 'text-red-600 dark:text-red-400';
		return 'text-muted-foreground';
	});

	const intakePct = $derived.by(() => {
		const t = tdee;
		if (!t || t.estimatedTDEE === null || t.estimatedTDEE === 0) return 0;
		return Math.min(100, Math.round((t.avgIntake / t.estimatedTDEE) * 100));
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-blue-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_tdee()}
		{headline}
		confidence={tdee?.confidence ?? 'insufficient'}
		sampleSize={tdee?.sampleSize ?? 0}
		borderColor="border-blue-500"
	>
		{#snippet children()}
			{#if tdee && tdee.estimatedTDEE !== null}
				<div class="space-y-3">
					<div class="flex items-center gap-2">
						<span class="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
							{Math.round(tdee.estimatedTDEE)}
						</span>
						<span class="text-sm text-muted-foreground">kcal</span>
						<span class="ml-auto text-lg font-semibold {trendColor}">{trendArrow}</span>
					</div>

					<div class="space-y-2">
						<div class="flex justify-between text-xs text-muted-foreground">
							<span>{m.analytics_tdee_intake()}</span>
							<span class="tabular-nums">{Math.round(tdee.avgIntake)} kcal</span>
						</div>
						<div class="h-2 w-full overflow-hidden rounded-full bg-muted/40">
							<div
								class="h-full rounded-full bg-blue-500 transition-all"
								style="width: {intakePct}%"
							></div>
						</div>
						<div class="flex justify-between text-xs text-muted-foreground">
							<span>{m.analytics_tdee_expenditure()}</span>
							<span class="tabular-nums">{Math.round(tdee.estimatedTDEE)} kcal</span>
						</div>
					</div>

					<div class="flex items-center justify-between border-t pt-2">
						<span class="text-xs text-muted-foreground">{m.analytics_tdee_rate()}</span>
						<span
							class="text-sm font-semibold tabular-nums {tdee.weeklyRate < -0.05
								? 'text-green-600 dark:text-green-400'
								: tdee.weeklyRate > 0.05
									? 'text-red-600 dark:text-red-400'
									: 'text-muted-foreground'}"
						>
							{tdee.weeklyRate >= 0 ? '+' : ''}{tdee.weeklyRate.toFixed(2)}
							{m.analytics_kg_per_week()}
						</span>
					</div>
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
