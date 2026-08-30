<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { pearsonCorrelation, getConfidenceLevel } from '$lib/analytics/correlation';
	import * as m from '$lib/paraglide/messages';
	import type { MealEntry } from './types';

	type SleepFoodPoint = {
		date: string;
		eveningCalories: number | null;
		sleepDurationMinutes: number | null;
		sleepQuality: number | null;
	};

	let {
		sleepFoodData = [],
		mealEntries = [],
		sleepWithBedtime = [],
		loading = false
	}: {
		sleepFoodData: SleepFoodPoint[];
		mealEntries: MealEntry[];
		sleepWithBedtime: { entryDate: string; bedtime: string }[];
		loading?: boolean;
	} = $props();

	/** Longest look-back from bedtime for a "last meal"; nights with nothing logged in it are skipped. */
	const LOOKBACK_HOURS = 14;
	/** Meals logged up to this long after the recorded bedtime still count (ate in bed, rounded bedtime). */
	const LOOKAHEAD_HOURS = 2;
	const MIN_PAIRS = 7;

	// Per night: the actual interval between the last logged meal and the
	// recorded bedtime, from the two instants. No scalar averaging of clock
	// times, no host-timezone reads, and late eaters (gap ≤ 0) stay in.
	const analysis = $derived.by(() => {
		if (sleepFoodData.length === 0 || mealEntries.length === 0 || sleepWithBedtime.length === 0) {
			return null;
		}

		const qualityByDate = new Map<string, number>();
		for (const point of sleepFoodData) {
			if (point.sleepQuality !== null) qualityByDate.set(point.date, point.sleepQuality);
		}

		const mealInstants = mealEntries
			.map((e) => (e.eatenAt ? Date.parse(e.eatenAt) : NaN))
			.filter((t) => !Number.isNaN(t))
			.sort((a, b) => a - b);

		const pairs: { gapHours: number; quality: number }[] = [];
		for (const night of sleepWithBedtime) {
			const quality = qualityByDate.get(night.entryDate);
			if (quality === undefined) continue;
			const bed = Date.parse(night.bedtime);
			if (Number.isNaN(bed)) continue;
			const windowStart = bed - LOOKBACK_HOURS * 3_600_000;
			const windowEnd = bed + LOOKAHEAD_HOURS * 3_600_000;
			let lastMeal: number | null = null;
			for (const t of mealInstants) {
				if (t < windowStart) continue;
				if (t > windowEnd) break;
				lastMeal = t;
			}
			if (lastMeal === null) continue;
			pairs.push({ gapHours: (bed - lastMeal) / 3_600_000, quality });
		}

		if (pairs.length === 0) return null;

		const avgGap = pairs.reduce((s, p) => s + p.gapHours, 0) / pairs.length;
		const corr =
			pairs.length >= MIN_PAIRS
				? pearsonCorrelation(
						pairs.map((p) => p.gapHours),
						pairs.map((p) => p.quality)
					)
				: null;

		return { corr, avgGap: Math.round(avgGap * 10) / 10, sampleSize: pairs.length };
	});

	const sampleSize = $derived.by(() => analysis?.sampleSize ?? 0);
	const confidence = $derived.by(() => getConfidenceLevel(sampleSize));

	const headline = $derived.by(() => {
		const a = analysis;
		if (!a) return m.analytics_presleep_no_data();
		return m.analytics_presleep_headline({ hours: a.avgGap.toString() });
	});
</script>

<InsightCard
	{loading}
	title={m.analytics_presleep_window()}
	{headline}
	{confidence}
	{sampleSize}
	borderColor="border-purple-500"
	skeletonClass="h-16"
>
	{#snippet children()}
		{@const a = analysis}
		{#if a}
			<div class="space-y-2">
				<div class="rounded-lg bg-muted/30 p-3 text-xs space-y-1">
					<div class="flex justify-between">
						<span class="text-muted-foreground">{m.analytics_presleep_avg_gap()}</span>
						<span class="font-semibold tabular-nums">{a.avgGap}h</span>
					</div>
					{#if a.corr}
						<div class="flex justify-between">
							<span class="text-muted-foreground">{m.analytics_presleep_correlation()}</span>
							<span
								class="font-semibold tabular-nums {a.corr.r > 0
									? 'text-green-600 dark:text-green-400'
									: 'text-red-600 dark:text-red-400'}"
							>
								r = {a.corr.r > 0 ? '+' : ''}{a.corr.r.toFixed(2)}
							</span>
						</div>
						<p class="text-[10px] text-muted-foreground tabular-nums text-right">
							{m.analytics_ci95({ low: a.corr.ciLow.toFixed(2), high: a.corr.ciHigh.toFixed(2) })}
							· {m.analytics_p_value({ p: a.corr.pValue.toFixed(3) })}
						</p>
					{/if}
				</div>
				<p class="text-[11px] text-muted-foreground">{m.analytics_correlation_disclaimer()}</p>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
		{/if}
	{/snippet}
</InsightCard>
