<script lang="ts">
	import { onMount } from 'svelte';
	import InsightCard from './InsightCard.svelte';
	import { computeNutrientOutcomeCorrelations } from '$lib/analytics/nutrient-correlation';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import { RDA_VALUES } from '$lib/analytics/rda';
	import * as m from '$lib/paraglide/messages';
	import { today, shiftDate } from '$lib/utils/dates';

	type SleepFoodPoint = {
		date: string;
		eveningCalories: number | null;
		sleepDurationMinutes: number | null;
		sleepQuality: number | null;
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
	let sleepFoodData = $state<SleepFoodPoint[]>([]);
	let nutrientSeries = $state<DailyNutrient[]>([]);

	const correlations = $derived(() => {
		if (sleepFoodData.length === 0 || nutrientSeries.length === 0) return [];

		const sleepOutcomes = sleepFoodData
			.filter((d) => d.sleepQuality !== null)
			.map((d) => ({ date: d.date, value: d.sleepQuality as number }));

		if (sleepOutcomes.length < 7) return [];

		const dailyNutrients = nutrientSeries.map((d) => ({
			date: d.date,
			nutrients: Object.fromEntries(
				RDA_VALUES.map((rda) => [
					rda.nutrientKey,
					(d[rda.nutrientKey] as number | null | undefined) ?? null
				])
			) as Record<string, number | null>
		}));

		return computeNutrientOutcomeCorrelations(dailyNutrients, sleepOutcomes, 0).slice(0, 8);
	});

	const sampleSize = $derived(() => sleepFoodData.filter((d) => d.sleepQuality !== null).length);
	const confidence = $derived(() => getConfidenceLevel(sampleSize()));

	const maxAbsR = $derived(() => {
		const corrs = correlations();
		if (corrs.length === 0) return 0;
		return Math.max(...corrs.map((c) => Math.abs(c.correlation.r)));
	});

	onMount(async () => {
		try {
			const endDate = today();
			const startDate = shiftDate(endDate, -59);
			const [sfRes, nRes] = await Promise.all([
				fetch(`/api/analytics/sleep-food?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/nutrients-daily?startDate=${startDate}&endDate=${endDate}`)
			]);
			if (!sfRes.ok || !nRes.ok) throw new Error('Failed to fetch');
			const [sfJson, nJson] = await Promise.all([sfRes.json(), nRes.json()]);
			sleepFoodData = sfJson.data ?? [];
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
		<div class="border-l-4 border-purple-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else if error}
	<div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{error}</div>
{:else}
	<InsightCard
		title={m.analytics_nutrient_sleep()}
		headline={m.analytics_nutrient_sleep_headline()}
		confidence={confidence()}
		sampleSize={sampleSize()}
		borderColor="border-purple-500"
	>
		{#snippet children()}
			{@const corrs = correlations()}
			{@const maxR = maxAbsR()}
			{#if corrs.length > 0}
				<div class="space-y-2">
					{#each corrs as nc (nc.nutrientKey)}
						{@const rda = RDA_VALUES.find((r) => r.nutrientKey === nc.nutrientKey)}
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
						{m.analytics_correlation_disclaimer()}
					</p>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
