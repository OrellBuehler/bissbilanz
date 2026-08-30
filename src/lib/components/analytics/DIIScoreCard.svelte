<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeDIIScore, type DIINutrient } from '$lib/analytics/food-quality';
	import { aggregateEntriesByDay } from '$lib/analytics/daily-coverage';
	import { round2 } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';

	type NutrientEntry = {
		date: string;
		calories: number;
		fiber?: number | null;
		omega3?: number | null;
		vitaminC?: number | null;
		vitaminD?: number | null;
		vitaminE?: number | null;
		saturatedFat?: number | null;
		transFat?: number | null;
		alcohol?: number | null;
		caffeine?: number | null;
	};

	let {
		nutrientEntries,
		loading
	}: {
		nutrientEntries: NutrientEntry[];
		loading: boolean;
	} = $props();

	const DII_KEYS = [
		'fiber',
		'omega3',
		'vitaminC',
		'vitaminD',
		'vitaminE',
		'saturatedFat',
		'transFat',
		'alcohol',
		'caffeine'
	] as const satisfies readonly DIINutrient[];

	// Days keep null where no food carried the nutrient, plus the calorie share
	// that did — the analytic gates each nutrient on that coverage.
	const dailyInputs = $derived.by(() =>
		aggregateEntriesByDay(nutrientEntries, DII_KEYS).map((day) => ({
			...day.values,
			coverage: day.coverage
		}))
	);

	const result = $derived.by(() => {
		if (dailyInputs.length === 0) return null;
		return computeDIIScore(dailyInputs);
	});

	const classLabel = $derived.by(() => {
		const c = result?.classification;
		if (c === 'anti-inflammatory') return m.analytics_dii_anti();
		if (c === 'neutral') return m.analytics_dii_neutral();
		return m.analytics_dii_pro();
	});

	const classColor = $derived.by(() => {
		const c = result?.classification;
		if (c === 'anti-inflammatory')
			return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
		if (c === 'neutral') return 'bg-muted text-muted-foreground';
		return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
	});
</script>

<InsightCard
	{loading}
	title={m.analytics_dii()}
	headline={m.analytics_dii_headline({
		score: (Math.round((result?.score ?? 0) * 100) / 100).toFixed(2)
	})}
	confidence={result?.confidence ?? 'insufficient'}
	sampleSize={result?.sampleSize ?? 0}
	borderColor="border-rose-500"
>
	{#snippet children()}
		{#if result}
			<div class="space-y-3">
				<span class="rounded-full px-2 py-0.5 text-[11px] font-medium {classColor}">
					{classLabel}
				</span>
				{#if result.contributors.length > 0}
					<div>
						<p class="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
							{m.analytics_dii_contributors()}
						</p>
						<div class="space-y-1">
							{#each result.contributors.slice(0, 3) as c (c.nutrient)}
								<div class="flex items-center justify-between text-xs">
									<span class="text-muted-foreground capitalize">{c.nutrient}</span>
									<span
										class="tabular-nums font-medium {c.impact < 0
											? 'text-green-600 dark:text-green-400'
											: 'text-red-600 dark:text-red-400'}"
									>
										{c.impact > 0 ? '+' : ''}{round2(c.impact).toFixed(2)}
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				<p class="text-[11px] text-muted-foreground">
					{m.analytics_dii_coverage({
						pct: Math.round(result.coverageFraction * 100).toString(),
						band: result.neutralBand.toFixed(2)
					})} · {m.analytics_dii_source()}
				</p>
			</div>
		{/if}
	{/snippet}
</InsightCard>
