<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeNutrientOutcomeCorrelations } from '$lib/analytics/nutrient-correlation';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import { RDA_VALUES } from '$lib/analytics/rda';
	import { assessAdequacy } from '$lib/analytics/nutrient-reference';
	import { MIN_NUTRIENT_COVERAGE } from '$lib/analytics/constants.generated';
	import { shiftDate } from '$lib/utils/dates';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { WeightFoodPoint, DailyNutrient } from './types';

	type Props = {
		weightFoodData: WeightFoodPoint[];
		nutrientDailyData: DailyNutrient[];
		loading: boolean;
	};

	let { weightFoodData, nutrientDailyData, loading }: Props = $props();

	const prefs = useLiveQuery(() => preferencesService.preferences(), undefined);
	const sex = $derived(prefs.value?.biologicalSex ?? null);

	// Outcome is the day-over-day weight *change* ending the next morning: two
	// trending level series (intake, body weight) correlate spuriously.
	const weightDeltas = $derived.by(() => {
		const byDate = new Map(
			weightFoodData.filter((d) => d.weightKg !== null).map((d) => [d.date, d.weightKg as number])
		);
		const deltas: { date: string; value: number }[] = [];
		for (const [date, kg] of byDate) {
			const next = byDate.get(shiftDate(date, 1));
			if (next !== undefined) deltas.push({ date, value: next - kg });
		}
		return deltas;
	});

	const nutrientCorrelations = $derived.by(() => {
		if (weightDeltas.length === 0 || nutrientDailyData.length === 0) return [];

		const dailyNutrients = nutrientDailyData.map((d) => ({
			date: d.date,
			nutrients: Object.fromEntries(
				RDA_VALUES.map((rda) => {
					const raw = d[rda.nutrientKey];
					const coverage = d[`${rda.nutrientKey}Coverage`];
					const covered = typeof coverage !== 'number' || coverage >= MIN_NUTRIENT_COVERAGE;
					return [rda.nutrientKey, typeof raw === 'number' && covered ? raw : null];
				})
			) as Record<string, number | null>
		}));

		return computeNutrientOutcomeCorrelations(dailyNutrients, weightDeltas, 0);
	});

	const avgCalories = $derived.by(() =>
		nutrientDailyData.length > 0
			? nutrientDailyData.reduce((s, d) => s + d.calories, 0) / nutrientDailyData.length
			: null
	);

	const avgNutrients = $derived.by(() => {
		const avgs = new Map<string, number>();
		for (const rda of RDA_VALUES) {
			const values: number[] = [];
			for (const day of nutrientDailyData) {
				const raw = day[rda.nutrientKey];
				if (typeof raw === 'number') values.push(raw);
			}
			if (values.length > 0) {
				avgs.set(rda.nutrientKey, values.reduce((s, v) => s + v, 0) / values.length);
			}
		}
		return avgs;
	});

	const displayNutrients = $derived.by(() => {
		const corrs = nutrientCorrelations;
		const avgs = avgNutrients;
		return corrs
			.slice(0, 6)
			.map((nc) => {
				const rda = RDA_VALUES.find((r) => r.nutrientKey === nc.nutrientKey);
				const avg = avgs.get(nc.nutrientKey);
				if (!rda || avg === undefined) return null;
				const assessment = assessAdequacy(rda, avg, sex, avgCalories);
				return {
					key: nc.nutrientKey,
					label: rda.label,
					unit: rda.unit,
					pct: Math.round(Math.min(assessment.pct, 200)),
					verdict: assessment.verdict,
					r: nc.correlation.r,
					ciLow: nc.correlation.ciLow,
					ciHigh: nc.correlation.ciHigh,
					qValue: nc.qValue,
					comparisons: nc.comparisons,
					avg: Math.round(avg * 10) / 10
				};
			})
			.filter((n): n is NonNullable<typeof n> => n !== null);
	});

	const comparisons = $derived.by(() => nutrientCorrelations[0]?.comparisons ?? 0);

	const sampleSize = $derived.by(() => Math.min(weightDeltas.length, nutrientDailyData.length));
	const confidence = $derived.by(() => getConfidenceLevel(sampleSize));
</script>

<InsightCard
	{loading}
	title={m.analytics_micronutrient_gaps()}
	headline={m.analytics_micronutrient_gaps_headline()}
	{confidence}
	{sampleSize}
	borderColor="border-green-500"
>
	{#snippet children()}
		{@const nutrients = displayNutrients}
		{#if nutrients.length > 0}
			<div class="space-y-2">
				{#each nutrients as nutrient (nutrient.key)}
					{@const isShort =
						nutrient.verdict === 'likely_inadequate' || nutrient.verdict === 'uncertain'}
					{@const trafficColor =
						nutrient.verdict === 'likely_adequate'
							? 'bg-green-500'
							: nutrient.verdict === 'likely_inadequate'
								? 'bg-red-500'
								: nutrient.verdict === 'no_conclusion'
									? 'bg-muted-foreground/40'
									: 'bg-amber-400'}
					<div class="space-y-0.5">
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full shrink-0 {trafficColor}"></div>
							<span
								class="w-28 shrink-0 text-xs truncate {isShort
									? 'font-medium'
									: 'text-muted-foreground'}"
							>
								{nutrient.label}
							</span>
							<div class="relative flex-1 h-3 bg-muted/40 rounded overflow-hidden">
								<div
									class="h-full rounded {trafficColor} opacity-60"
									style="width: {Math.min(nutrient.pct, 100)}%"
								></div>
							</div>
							<span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
								{nutrient.pct}%
							</span>
							<span
								class="w-12 shrink-0 text-right text-[10px] tabular-nums {nutrient.r < 0
									? 'text-green-600 dark:text-green-400'
									: 'text-red-500 dark:text-red-400'}"
							>
								r={nutrient.r.toFixed(2)}
							</span>
						</div>
						<p class="pl-5 text-[10px] text-muted-foreground tabular-nums">
							{m.analytics_ci95({
								low: nutrient.ciLow.toFixed(2),
								high: nutrient.ciHigh.toFixed(2)
							})} · {m.analytics_q_value({ q: nutrient.qValue.toFixed(3) })}
						</p>
					</div>
				{/each}
				<p class="text-[11px] text-muted-foreground pt-1">
					{m.analytics_screened({ n: comparisons.toString() })} · {m.analytics_correlation_disclaimer()}
				</p>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
		{/if}
	{/snippet}
</InsightCard>
