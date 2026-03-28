<script lang="ts">
	import { onMount } from 'svelte';
	import InsightCard from './InsightCard.svelte';
	import { computeCaloricLag } from '$lib/analytics/caloric-lag';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { WeightFoodPoint } from './types';

	type Props = {
		weightFoodData: WeightFoodPoint[];
		loading: boolean;
	};

	let { weightFoodData, loading }: Props = $props();

	let overrideLag = $state<number | null>(null);

	const lagResult = $derived.by(() => {
		if (weightFoodData.length === 0) return null;
		const calorieData = weightFoodData
			.filter((d) => d.calories !== null)
			.map((d) => ({ date: d.date, value: d.calories }));
		const weightData = weightFoodData
			.filter((d) => d.weightKg !== null)
			.map((d) => ({ date: d.date, value: d.weightKg }));
		return computeCaloricLag(calorieData, weightData, 7);
	});

	const bestLag = $derived.by(() => overrideLag ?? lagResult?.bestLag ?? null);

	const sampleSize = $derived.by(() => {
		const result = lagResult;
		if (!result) return 0;
		const validResults = result.results.filter((r) => r.correlation !== null);
		return validResults.length > 0 ? (validResults[0].correlation?.sampleSize ?? 0) : 0;
	});

	const confidence = $derived.by(() => getConfidenceLevel(sampleSize));

	const headline = $derived.by(() => {
		const lag = bestLag;
		if (lag === null) return m.analytics_caloric_lag_no_result();
		return m.analytics_caloric_lag_headline({ days: lag.toString() });
	});

	const maxAbsR = $derived.by(() => {
		const result = lagResult;
		if (!result) return 0;
		let max = 0;
		for (const r of result.results) {
			if (r.correlation !== null) {
				const abs = Math.abs(r.correlation.r);
				if (abs > max) max = abs;
			}
		}
		return max;
	});

	let initialOverride: number | null = null;

	const saveOverride = (lag: number | null) => {
		if (lag === initialOverride) return;
		initialOverride = lag;
		preferencesService.update({ caloricLagDaysOverride: lag });
	};

	onMount(async () => {
		try {
			const prefsRes = await fetch('/api/preferences');
			if (prefsRes.ok) {
				const prefsJson = await prefsRes.json();
				const saved = prefsJson.preferences?.caloricLagDaysOverride ?? null;
				overrideLag = saved;
				initialOverride = saved;
			}
		} catch {
			// use default
		}
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
		title={m.analytics_caloric_lag()}
		{headline}
		{confidence}
		{sampleSize}
		borderColor="border-blue-500"
	>
		{#snippet children()}
			{#if lagResult}
				<div class="space-y-3">
					<div class="space-y-1.5">
						{#each lagResult?.results ?? [] as result (result.lag)}
							{@const r = result.correlation?.r ?? 0}
							{@const absR = Math.abs(r)}
							{@const isActive = result.lag === bestLag}
							{@const barPct = maxAbsR > 0 ? (absR / maxAbsR) * 100 : 0}
							<div class="flex items-center gap-2">
								<span class="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
									{m.analytics_caloric_lag_day({ n: result.lag.toString() })}
								</span>
								<div class="relative flex-1 h-5 bg-muted/40 rounded overflow-hidden">
									<div
										class="h-full rounded transition-all {isActive
											? 'bg-blue-500'
											: 'bg-blue-300/60 dark:bg-blue-700/40'}"
										style="width: {barPct}%"
									></div>
								</div>
								<span
									class="w-12 shrink-0 text-right text-xs tabular-nums {isActive
										? 'font-semibold text-blue-600 dark:text-blue-400'
										: 'text-muted-foreground'}"
								>
									{result.correlation ? result.correlation.r.toFixed(2) : '—'}
								</span>
							</div>
						{/each}
					</div>

					<div class="flex items-center gap-2 pt-1">
						<span class="text-xs text-muted-foreground">{m.analytics_caloric_lag_override()}</span>
						<div class="flex gap-1">
							<button
								class="rounded px-2 py-0.5 text-xs {overrideLag === null
									? 'bg-blue-500 text-white'
									: 'bg-muted text-muted-foreground hover:bg-muted/70'}"
								onclick={() => {
									overrideLag = null;
									saveOverride(null);
								}}
							>
								{m.analytics_caloric_lag_auto()}
							</button>
							{#each [1, 2, 3, 4, 5, 6, 7] as day (day)}
								<button
									class="rounded px-2 py-0.5 text-xs {overrideLag === day
										? 'bg-blue-500 text-white'
										: 'bg-muted text-muted-foreground hover:bg-muted/70'}"
									onclick={() => {
										overrideLag = day;
										saveOverride(day);
									}}
								>
									{day}
								</button>
							{/each}
						</div>
					</div>

					<p class="text-[11px] text-muted-foreground">{m.analytics_correlation_disclaimer()}</p>
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
