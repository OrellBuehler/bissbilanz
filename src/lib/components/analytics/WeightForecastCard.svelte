<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeAdaptiveTDEE, projectWeight } from '$lib/analytics/tdee';
	import * as m from '$lib/paraglide/messages';

	type WeightFoodPoint = {
		date: string;
		calories: number | null;
		weightKg: number | null;
		movingAvg: number | null;
	};

	let {
		weightFoodData,
		loading
	}: {
		weightFoodData: WeightFoodPoint[];
		loading: boolean;
	} = $props();

	const forecast = $derived.by(() => {
		if (weightFoodData.length === 0) return null;
		const weightSeries = weightFoodData.map((d) => ({ date: d.date, weightKg: d.weightKg }));
		const calorieSeries = weightFoodData.map((d) => ({ date: d.date, calories: d.calories }));
		const tdee = computeAdaptiveTDEE(weightSeries, calorieSeries, 14);
		return projectWeight(weightSeries, tdee.weeklyRate);
	});

	const headline = $derived.by(() => {
		const f = forecast;
		if (!f || f.day30 === null) return m.analytics_forecast_no_data();
		return m.analytics_forecast_headline({ weight: f.day30.toFixed(1) });
	});

	const formatKg = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} kg`);
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-emerald-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
		title={m.analytics_forecast()}
		{headline}
		confidence={forecast?.confidence ?? 'insufficient'}
		sampleSize={forecast ? (forecast.currentWeight !== null ? 1 : 0) : 0}
		borderColor="border-emerald-500"
	>
		{#snippet children()}
			{#if forecast && forecast.currentWeight !== null}
				<div class="space-y-3">
					<div class="grid grid-cols-3 gap-2">
						<div class="rounded-lg bg-muted/30 p-2 text-center">
							<p class="text-[11px] text-muted-foreground">{m.analytics_forecast_30d()}</p>
							<p
								class="mt-0.5 text-sm font-semibold tabular-nums {forecast.day30 !== null &&
								forecast.currentWeight !== null &&
								forecast.day30 < forecast.currentWeight
									? 'text-green-600 dark:text-green-400'
									: forecast.day30 !== null &&
										  forecast.currentWeight !== null &&
										  forecast.day30 > forecast.currentWeight
										? 'text-red-600 dark:text-red-400'
										: ''}"
							>
								{formatKg(forecast.day30)}
							</p>
						</div>
						<div class="rounded-lg bg-muted/30 p-2 text-center">
							<p class="text-[11px] text-muted-foreground">{m.analytics_forecast_60d()}</p>
							<p
								class="mt-0.5 text-sm font-semibold tabular-nums {forecast.day60 !== null &&
								forecast.currentWeight !== null &&
								forecast.day60 < forecast.currentWeight
									? 'text-green-600 dark:text-green-400'
									: forecast.day60 !== null &&
										  forecast.currentWeight !== null &&
										  forecast.day60 > forecast.currentWeight
										? 'text-red-600 dark:text-red-400'
										: ''}"
							>
								{formatKg(forecast.day60)}
							</p>
						</div>
						<div class="rounded-lg bg-muted/30 p-2 text-center">
							<p class="text-[11px] text-muted-foreground">{m.analytics_forecast_90d()}</p>
							<p
								class="mt-0.5 text-sm font-semibold tabular-nums {forecast.day90 !== null &&
								forecast.currentWeight !== null &&
								forecast.day90 < forecast.currentWeight
									? 'text-green-600 dark:text-green-400'
									: forecast.day90 !== null &&
										  forecast.currentWeight !== null &&
										  forecast.day90 > forecast.currentWeight
										? 'text-red-600 dark:text-red-400'
										: ''}"
							>
								{formatKg(forecast.day90)}
							</p>
						</div>
					</div>

					<div class="flex items-center justify-between border-t pt-2">
						<span class="text-xs text-muted-foreground">{m.analytics_forecast_rate()}</span>
						<span
							class="text-sm font-semibold tabular-nums {forecast.weeklyRate < -0.05
								? 'text-green-600 dark:text-green-400'
								: forecast.weeklyRate > 0.05
									? 'text-red-600 dark:text-red-400'
									: 'text-muted-foreground'}"
						>
							{forecast.weeklyRate >= 0 ? '+' : ''}{forecast.weeklyRate.toFixed(2)} kg/week
						</span>
					</div>

					<p class="text-[11px] text-muted-foreground">{m.analytics_forecast_disclaimer()}</p>
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
