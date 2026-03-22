<script lang="ts">
	import { onMount } from 'svelte';
	import InsightCard from './InsightCard.svelte';
	import { computeNutrientOutcomeCorrelations } from '$lib/analytics/nutrient-correlation';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import { RDA_VALUES } from '$lib/analytics/rda';
	import * as m from '$lib/paraglide/messages';
	import { today, shiftDate } from '$lib/utils/dates';

	type WeightFoodPoint = {
		date: string;
		calories: number | null;
		weightKg: number | null;
		movingAvg: number | null;
	};

	type DailyNutrient = {
		date: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		[key: string]: number | string;
	};

	let loading = $state(true);
	let error = $state<string | null>(null);
	let weightSeries = $state<WeightFoodPoint[]>([]);
	let nutrientSeries = $state<DailyNutrient[]>([]);

	const nutrientCorrelations = $derived(() => {
		if (weightSeries.length === 0 || nutrientSeries.length === 0) return [];

		const weightOutcomes = weightSeries
			.filter((d) => d.weightKg !== null)
			.map((d) => ({ date: d.date, value: d.weightKg as number }));

		const dailyNutrients = nutrientSeries.map((d) => ({
			date: d.date,
			nutrients: Object.fromEntries(
				RDA_VALUES.map((rda) => [
					rda.nutrientKey,
					(d[rda.nutrientKey] as number | null | undefined) ?? null
				])
			) as Record<string, number | null>
		}));

		return computeNutrientOutcomeCorrelations(dailyNutrients, weightOutcomes, 0);
	});

	const avgNutrients = $derived(() => {
		if (nutrientSeries.length === 0) return new Map<string, number>();
		const totals = new Map<string, number>();
		for (const day of nutrientSeries) {
			for (const rda of RDA_VALUES) {
				const val = (day[rda.nutrientKey] as number | undefined) ?? 0;
				totals.set(rda.nutrientKey, (totals.get(rda.nutrientKey) ?? 0) + val);
			}
		}
		const avgs = new Map<string, number>();
		for (const [key, total] of totals) {
			avgs.set(key, total / nutrientSeries.length);
		}
		return avgs;
	});

	const displayNutrients = $derived(() => {
		const corrs = nutrientCorrelations();
		const avgs = avgNutrients();
		return corrs
			.slice(0, 6)
			.map((nc) => {
				const rda = RDA_VALUES.find((r) => r.nutrientKey === nc.nutrientKey);
				if (!rda) return null;
				const avg = avgs.get(nc.nutrientKey) ?? 0;
				const rdaVal = (rda.rdaMale + rda.rdaFemale) / 2;
				const pct = rdaVal > 0 ? Math.min((avg / rdaVal) * 100, 200) : 0;
				return {
					key: nc.nutrientKey,
					label: rda.label,
					unit: rda.unit,
					pct: Math.round(pct),
					r: nc.correlation.r,
					avg: Math.round(avg * 10) / 10,
					rda: rdaVal
				};
			})
			.filter((n): n is NonNullable<typeof n> => n !== null);
	});

	const sampleSize = $derived(() =>
		Math.min(weightSeries.filter((d) => d.weightKg !== null).length, nutrientSeries.length)
	);
	const confidence = $derived(() => getConfidenceLevel(sampleSize()));

	onMount(async () => {
		try {
			const endDate = today();
			const startDate = shiftDate(endDate, -29);
			const [wRes, nRes] = await Promise.all([
				fetch(`/api/analytics/weight-food?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/nutrients-daily?startDate=${startDate}&endDate=${endDate}`)
			]);
			if (!wRes.ok || !nRes.ok) throw new Error('Failed to fetch');
			const [wJson, nJson] = await Promise.all([wRes.json(), nRes.json()]);
			weightSeries = wJson.data ?? [];
			nutrientSeries = nJson.data ?? [];
		} catch {
			error = 'Failed to load data';
		} finally {
			loading = false;
		}
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-green-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else if error}
	<div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{error}</div>
{:else}
	<InsightCard
		title={m.analytics_micronutrient_gaps()}
		headline={m.analytics_micronutrient_gaps_headline()}
		confidence={confidence()}
		sampleSize={sampleSize()}
		borderColor="border-green-500"
	>
		{#snippet children()}
			{@const nutrients = displayNutrients()}
			{#if nutrients.length > 0}
				<div class="space-y-2">
					{#each nutrients as nutrient (nutrient.key)}
						{@const isDeficient = nutrient.pct < 80}
						{@const trafficColor =
							nutrient.pct >= 80
								? 'bg-green-500'
								: nutrient.pct >= 50
									? 'bg-amber-400'
									: 'bg-red-500'}
						{@const textColor =
							nutrient.pct >= 80
								? 'text-green-600 dark:text-green-400'
								: nutrient.pct >= 50
									? 'text-amber-600 dark:text-amber-400'
									: 'text-red-600 dark:text-red-400'}
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 rounded-full shrink-0 {trafficColor}"></div>
							<span
								class="w-28 shrink-0 text-xs truncate {isDeficient
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
							<span class="w-10 shrink-0 text-right text-xs tabular-nums {textColor}">
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
					{/each}
					<p class="text-[11px] text-muted-foreground pt-1">
						{m.analytics_correlation_disclaimer()}
					</p>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
