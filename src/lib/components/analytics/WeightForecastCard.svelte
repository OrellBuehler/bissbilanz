<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeAdaptiveTDEE, projectWeight } from '$lib/analytics/tdee';
	import { computeGoalProjection } from '$lib/analytics/weight-goal';
	import {
		classifyWeightChangeTone,
		DIRECTION_TONE_TEXT_CLASS
	} from '$lib/analytics/weight-direction';
	import { today } from '$lib/utils/dates';
	import { formatDateLabel } from '$lib/utils/dates';
	import { formatKg } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import TrendingDown from '@lucide/svelte/icons/trending-down';
	import Minus from '@lucide/svelte/icons/minus';
	import type { WeightFoodPoint } from './types';

	let {
		weightFoodData,
		loading,
		targetWeightKg = null,
		targetDate = null
	}: {
		weightFoodData: WeightFoodPoint[];
		loading: boolean;
		targetWeightKg?: number | null;
		targetDate?: string | null;
	} = $props();

	const forecast = $derived.by(() => {
		if (weightFoodData.length === 0) return null;
		const weightSeries = weightFoodData.map((d) => ({ date: d.date, weightKg: d.weightKg }));
		const calorieSeries = weightFoodData.map((d) => ({ date: d.date, calories: d.calories }));
		const tdee = computeAdaptiveTDEE(weightSeries, calorieSeries, 14);
		return projectWeight(weightSeries, tdee.weeklyRate, tdee.confidence);
	});

	const headline = $derived.by(() => {
		const f = forecast;
		if (!f || f.day30 === null) return m.analytics_forecast_no_data();
		return m.analytics_forecast_headline({ weight: f.day30.toFixed(1) });
	});

	const targetProjection = $derived(
		forecast
			? computeGoalProjection({
					currentWeightKg: forecast.currentWeight,
					targetWeightKg,
					targetDate,
					ratePerWeekKg: forecast.weeklyRate,
					asOf: today()
				})
			: null
	);

	// The direction that counts as progress toward the user's goal. Without a
	// resolvable target (no target weight, or already within it) this is
	// `null`, and every forecasted change below is displayed as neutral —
	// weight loss is not assumed to be the objective.
	const goalDirection = $derived(targetProjection?.direction ?? null);

	const formatWeight = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} kg`);

	type BoxDisplay = { icon: 'up' | 'down' | 'flat'; class: string };

	const boxDisplay = (projected: number | null, current: number | null): BoxDisplay => {
		if (projected === null || current === null) {
			return { icon: 'flat', class: DIRECTION_TONE_TEXT_CLASS.neutral };
		}
		const delta = projected - current;
		const tone = classifyWeightChangeTone(delta, goalDirection);
		const icon = Math.abs(delta) < 0.05 ? 'flat' : delta < 0 ? 'down' : 'up';
		return { icon, class: DIRECTION_TONE_TEXT_CLASS[tone] };
	};

	const day30Display = $derived(
		boxDisplay(forecast?.day30 ?? null, forecast?.currentWeight ?? null)
	);
	const day60Display = $derived(
		boxDisplay(forecast?.day60 ?? null, forecast?.currentWeight ?? null)
	);
	const day90Display = $derived(
		boxDisplay(forecast?.day90 ?? null, forecast?.currentWeight ?? null)
	);
	const rateClass = $derived(
		forecast
			? DIRECTION_TONE_TEXT_CLASS[classifyWeightChangeTone(forecast.weeklyRate, goalDirection)]
			: DIRECTION_TONE_TEXT_CLASS.neutral
	);
</script>

<InsightCard
	{loading}
	title={m.analytics_forecast()}
	{headline}
	confidence={forecast?.confidence ?? 'insufficient'}
	sampleSize={forecast?.sampleSize ?? 0}
	borderColor="border-emerald-500"
>
	{#snippet children()}
		{#if forecast && forecast.currentWeight !== null}
			<div class="space-y-3">
				<div class="grid grid-cols-3 gap-2">
					<div class="rounded-lg bg-muted/30 p-2 text-center">
						<p class="text-[11px] text-muted-foreground">{m.analytics_forecast_30d()}</p>
						<p
							class="mt-0.5 flex items-center justify-center gap-1 text-sm font-semibold tabular-nums {day30Display.class}"
						>
							{#if day30Display.icon === 'up'}
								<TrendingUp class="size-3" />
							{:else if day30Display.icon === 'down'}
								<TrendingDown class="size-3" />
							{:else}
								<Minus class="size-3" />
							{/if}
							{formatWeight(forecast.day30)}
						</p>
					</div>
					<div class="rounded-lg bg-muted/30 p-2 text-center">
						<p class="text-[11px] text-muted-foreground">{m.analytics_forecast_60d()}</p>
						<p
							class="mt-0.5 flex items-center justify-center gap-1 text-sm font-semibold tabular-nums {day60Display.class}"
						>
							{#if day60Display.icon === 'up'}
								<TrendingUp class="size-3" />
							{:else if day60Display.icon === 'down'}
								<TrendingDown class="size-3" />
							{:else}
								<Minus class="size-3" />
							{/if}
							{formatWeight(forecast.day60)}
						</p>
					</div>
					<div class="rounded-lg bg-muted/30 p-2 text-center">
						<p class="text-[11px] text-muted-foreground">{m.analytics_forecast_90d()}</p>
						<p
							class="mt-0.5 flex items-center justify-center gap-1 text-sm font-semibold tabular-nums {day90Display.class}"
						>
							{#if day90Display.icon === 'up'}
								<TrendingUp class="size-3" />
							{:else if day90Display.icon === 'down'}
								<TrendingDown class="size-3" />
							{:else}
								<Minus class="size-3" />
							{/if}
							{formatWeight(forecast.day90)}
						</p>
					</div>
				</div>

				<div class="flex items-center justify-between border-t pt-2">
					<span class="text-xs text-muted-foreground">{m.analytics_forecast_rate()}</span>
					<span class="text-sm font-semibold tabular-nums {rateClass}">
						{forecast.weeklyRate >= 0 ? '+' : ''}{forecast.weeklyRate.toFixed(2)}
						{m.analytics_kg_per_week()}
					</span>
				</div>

				{#if targetProjection}
					<div class="flex items-center justify-between border-t pt-2">
						<span class="text-xs text-muted-foreground">
							{m.analytics_forecast_target_eta()} · {formatKg(targetProjection.targetWeightKg)} kg
						</span>
						<span class="text-sm font-semibold tabular-nums">
							{targetProjection.reached
								? m.weight_target_reached()
								: targetProjection.projectedDate
									? formatDateLabel(targetProjection.projectedDate)
									: m.analytics_forecast_target_none()}
						</span>
					</div>
					{#if targetProjection.projectedDate && !targetProjection.reached}
						<p class="text-[11px] text-muted-foreground">{m.analytics_forecast_target_basis()}</p>
					{/if}
				{/if}

				<p class="text-[11px] text-muted-foreground">
					{m.analytics_forecast_anchor()} · {m.analytics_forecast_disclaimer()}
				</p>
			</div>
		{/if}
	{/snippet}
</InsightCard>
