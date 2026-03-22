<script lang="ts">
	import { onMount } from 'svelte';
	import InsightCard from './InsightCard.svelte';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import { RDA_VALUES } from '$lib/analytics/rda';
	import * as m from '$lib/paraglide/messages';
	import { today, shiftDate } from '$lib/utils/dates';

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
	let nutrientSeries = $state<DailyNutrient[]>([]);

	const adequacyData = $derived.by(() => {
		if (nutrientSeries.length === 0) return [];

		return RDA_VALUES.map((rda) => {
			const avg =
				nutrientSeries.reduce((sum, day) => {
					const val = (day[rda.nutrientKey] as number | undefined) ?? 0;
					return sum + val;
				}, 0) / nutrientSeries.length;

			const rdaVal = (rda.rdaMale + rda.rdaFemale) / 2;
			const pct = rdaVal > 0 ? Math.min((avg / rdaVal) * 100, 200) : 0;

			return {
				key: rda.nutrientKey,
				label: rda.label,
				unit: rda.unit,
				avg: Math.round(avg * 10) / 10,
				rda: Math.round(rdaVal * 10) / 10,
				pct: Math.round(pct)
			};
		})
			.filter((n) => n.avg > 0)
			.sort((a, b) => a.pct - b.pct);
	});

	const sampleSize = $derived.by(() => nutrientSeries.length);
	const confidence = $derived.by(() => getConfidenceLevel(sampleSize));

	onMount(async () => {
		try {
			const endDate = today();
			const startDate = shiftDate(endDate, -29);
			const res = await fetch(
				`/api/analytics/nutrients-daily?startDate=${startDate}&endDate=${endDate}`
			);
			if (!res.ok) throw new Error('Failed to fetch');
			const json = await res.json();
			nutrientSeries = json.data ?? [];
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
			<div class="bg-muted/50 h-48 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else if error}
	<div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{error}</div>
{:else}
	<InsightCard
		title={m.analytics_nutrient_adequacy()}
		headline={m.analytics_nutrient_adequacy_headline()}
		{confidence}
		{sampleSize}
		borderColor="border-green-500"
	>
		{#snippet children()}
			{@const nutrients = adequacyData}
			{#if nutrients.length > 0}
				<div class="space-y-1.5">
					{#each nutrients as nutrient (nutrient.key)}
						{@const barColor =
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
							<span
								class="w-28 shrink-0 text-xs truncate text-muted-foreground"
								title={nutrient.label}
							>
								{nutrient.label}
							</span>
							<div class="relative flex-1 h-3 bg-muted/40 rounded overflow-hidden">
								<div
									class="h-full rounded {barColor} opacity-70"
									style="width: {Math.min(nutrient.pct, 100)}%"
								></div>
								{#if nutrient.pct > 100}
									<div class="absolute right-0 top-0 h-full w-0.5 bg-border"></div>
								{/if}
							</div>
							<span class="w-10 shrink-0 text-right text-xs tabular-nums {textColor}">
								{nutrient.pct}%
							</span>
						</div>
					{/each}
					<p class="text-[11px] text-muted-foreground pt-1">
						Based on {sampleSize}-day average vs. average RDA
					</p>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
