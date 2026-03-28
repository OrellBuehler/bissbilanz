<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { extractMealTimingPatterns } from '$lib/analytics/meal-timing';
	import { pearsonCorrelation, getConfidenceLevel } from '$lib/analytics/correlation';
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
		return extractMealTimingPatterns(mealTimingData);
	});

	const avgWindowHours = $derived.by(() => {
		const analysis = timingAnalysis;
		if (!analysis) return 0;
		return Math.round(analysis.avgWindowMinutes / 60);
	});

	const correlationResult = $derived.by(() => {
		const analysis = timingAnalysis;
		if (!analysis || analysis.dailyWindows.length < 3) return null;

		const weightByDate = new Map(
			weightFoodData.filter((d) => d.weightKg !== null).map((d) => [d.date, d.weightKg as number])
		);
		const dates = [...weightByDate.keys()].sort();
		if (dates.length < 3) return null;

		const weightChanges = new Map<string, number>();
		for (let i = 1; i < dates.length; i++) {
			const prev = weightByDate.get(dates[i - 1]);
			const curr = weightByDate.get(dates[i]);
			if (prev !== undefined && curr !== undefined) {
				weightChanges.set(dates[i], curr - prev);
			}
		}

		const windowByDate = new Map(analysis.dailyWindows.map((w) => [w.date, w.windowMinutes]));

		const pairs: { windowHours: number; weightChange: number }[] = [];
		for (const [date, change] of weightChanges) {
			const windowMin = windowByDate.get(date);
			if (windowMin !== undefined) {
				pairs.push({ windowHours: windowMin / 60, weightChange: change });
			}
		}

		if (pairs.length < 3) return null;

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
		return parseInt(analysis.avgLastMealTime.split(':')[0]);
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
								style="left: {startPct}%; width: {Math.max(widthPct, 2)}%"
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
						<div class="rounded-lg bg-muted/30 p-3 text-xs">
							<span class="text-muted-foreground">{m.analytics_window_vs_weight()}</span>
							<span
								class="font-semibold tabular-nums {correlationResult!.r < 0
									? 'text-green-600 dark:text-green-400'
									: 'text-red-600 dark:text-red-400'}"
							>
								r = {correlationResult!.r.toFixed(2)}
							</span>
							<span class="text-muted-foreground ml-1 text-[10px]">
								{m.analytics_window_vs_weight_hint()}
							</span>
						</div>
					{/if}

					<p class="text-[11px] text-muted-foreground">{m.analytics_correlation_disclaimer()}</p>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
