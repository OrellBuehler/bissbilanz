<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { extractMealTimingPatterns } from '$lib/analytics/meal-timing';
	import { deviceTimeZone } from '$lib/analytics/local-time';
	import { pearsonCorrelation, getConfidenceLevel } from '$lib/analytics/correlation';
	import { shiftDate } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';
	import type { WeightFoodPoint, MealEntry } from './types';

	type Props = {
		weightFoodData: WeightFoodPoint[];
		mealTimingData: MealEntry[];
		loading: boolean;
	};

	let { weightFoodData, mealTimingData, loading }: Props = $props();

	const timingAnalysis = $derived.by(() => {
		if (mealTimingData.length === 0) return null;
		return extractMealTimingPatterns(mealTimingData, deviceTimeZone());
	});

	const avgWindowHours = $derived.by(() => {
		const analysis = timingAnalysis;
		if (!analysis) return 0;
		return Math.round(analysis.avgWindowMinutes / 60);
	});

	// Day d's eating window is paired with the weight change that *ends the
	// following morning* (weight(d+1) − weight(d)); pairing it with the change
	// ending on d's own weigh-in would put most of the predictor after the outcome.
	const correlationResult = $derived.by(() => {
		const analysis = timingAnalysis;
		if (!analysis || analysis.dailyWindows.length < 7) return null;

		const weightByDate = new Map(
			weightFoodData.filter((d) => d.weightKg !== null).map((d) => [d.date, d.weightKg as number])
		);
		if (weightByDate.size < 7) return null;

		const pairs: { windowHours: number; weightChange: number }[] = [];
		for (const w of analysis.dailyWindows) {
			const start = weightByDate.get(w.date);
			const end = weightByDate.get(shiftDate(w.date, 1));
			if (start === undefined || end === undefined) continue;
			pairs.push({ windowHours: w.windowMinutes / 60, weightChange: end - start });
		}

		if (pairs.length < 7) return null;

		return pearsonCorrelation(
			pairs.map((p) => p.windowHours),
			pairs.map((p) => p.weightChange)
		);
	});

	const sampleSize = $derived.by(
		() => correlationResult?.sampleSize ?? timingAnalysis?.dailyWindows.length ?? 0
	);
	const confidence = $derived.by(() => getConfidenceLevel(sampleSize));

	const firstMealHour = $derived.by(() => {
		const analysis = timingAnalysis;
		if (!analysis) return 8;
		return parseInt(analysis.avgFirstMealTime.split(':')[0]);
	});

	const lastMealHour = $derived.by(() => {
		const analysis = timingAnalysis;
		if (!analysis) return 20;
		const h = parseInt(analysis.avgLastMealTime.split(':')[0]);
		return h < firstMealHour ? h + 24 : h;
	});
</script>

<InsightCard
	{loading}
	title={m.analytics_meal_timing_weight()}
	headline={m.analytics_meal_timing_headline({ hours: avgWindowHours.toString() })}
	{confidence}
	{sampleSize}
	borderColor="border-amber-500"
>
	{#snippet children()}
		{@const analysis = timingAnalysis}
		{#if analysis}
			{@const startPct = (firstMealHour / 24) * 100}
			{@const widthPct = ((lastMealHour - firstMealHour) / 24) * 100}
			<div class="space-y-3">
				<div class="space-y-1">
					<p class="text-xs text-muted-foreground">{m.analytics_avg_eating_window_24h()}</p>
					<div class="relative h-6 bg-muted/40 rounded overflow-hidden">
						<div
							class="absolute h-full rounded bg-amber-400/70 dark:bg-amber-600/50"
							style="left: {startPct}%; width: {Math.min(100 - startPct, Math.max(widthPct, 2))}%"
						></div>
					</div>
					<div class="flex justify-between text-[10px] text-muted-foreground tabular-nums">
						<span>0h</span>
						<span class="text-amber-600 dark:text-amber-400 font-medium">
							{analysis.avgFirstMealTime} – {analysis.avgLastMealTime}
							({avgWindowHours}h window)
						</span>
						<span>24h</span>
					</div>
				</div>

				{#if correlationResult}
					<div class="rounded-lg bg-muted/30 p-3 text-xs space-y-0.5">
						<div>
							<span class="text-muted-foreground">{m.analytics_window_vs_weight()}</span>
							<span
								class="font-semibold tabular-nums {correlationResult.r < 0
									? 'text-green-600 dark:text-green-400'
									: 'text-red-600 dark:text-red-400'}"
							>
								r = {correlationResult.r.toFixed(2)}
							</span>
							<span class="text-muted-foreground ml-1 text-[10px]">
								{m.analytics_window_vs_weight_hint()}
							</span>
						</div>
						<p class="text-[10px] text-muted-foreground tabular-nums">
							{m.analytics_ci95({
								low: correlationResult.ciLow.toFixed(2),
								high: correlationResult.ciHigh.toFixed(2)
							})} · {m.analytics_p_value({ p: correlationResult.pValue.toFixed(3) })}
						</p>
					</div>
				{/if}

				<p class="text-[11px] text-muted-foreground">{m.analytics_meal_timing_evidence()}</p>
				<p class="text-[11px] text-muted-foreground">{m.analytics_correlation_disclaimer()}</p>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
		{/if}
	{/snippet}
</InsightCard>
