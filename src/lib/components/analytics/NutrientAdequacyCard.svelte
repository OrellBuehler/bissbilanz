<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import { RDA_VALUES } from '$lib/analytics/rda';
	import { assessAdequacy, type AdequacyVerdict } from '$lib/analytics/nutrient-reference';
	import { MIN_NUTRIENT_COVERAGE } from '$lib/analytics/constants.generated';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { DailyNutrient } from './types';

	type Props = {
		nutrientDailyData: DailyNutrient[];
		loading: boolean;
	};

	let { nutrientDailyData, loading }: Props = $props();

	const prefs = useLiveQuery(() => preferencesService.preferences(), undefined);
	const sex = $derived(prefs.value?.biologicalSex ?? null);

	// Mean over the days that actually carried a value for the nutrient at or
	// above the coverage floor — an unmeasured day is unknown, not a zero.
	const adequacyData = $derived.by(() => {
		if (nutrientDailyData.length === 0) return [];
		const avgCalories =
			nutrientDailyData.reduce((s, d) => s + d.calories, 0) / nutrientDailyData.length;

		return RDA_VALUES.map((rda) => {
			const values: number[] = [];
			for (const day of nutrientDailyData) {
				const raw = day[rda.nutrientKey];
				if (typeof raw !== 'number') continue;
				const coverage = day[`${rda.nutrientKey}Coverage`];
				if (typeof coverage === 'number' && coverage < MIN_NUTRIENT_COVERAGE) continue;
				values.push(raw);
			}
			if (values.length === 0) return null;
			const avg = values.reduce((s, v) => s + v, 0) / values.length;
			const assessment = assessAdequacy(rda, avg, sex, avgCalories);
			return {
				key: rda.nutrientKey,
				label: rda.label,
				unit: rda.unit,
				avg: Math.round(avg * 10) / 10,
				days: values.length,
				...assessment,
				pct: Math.round(assessment.pct),
				pctLow: Math.round(assessment.pctLow),
				pctHigh: Math.round(assessment.pctHigh)
			};
		})
			.filter((n): n is NonNullable<typeof n> => n !== null && n.avg > 0)
			.sort((a, b) => a.pct - b.pct);
	});

	const sampleSize = $derived.by(() => nutrientDailyData.length);
	const confidence = $derived.by(() => getConfidenceLevel(sampleSize));

	const verdictLabel = (v: AdequacyVerdict) => {
		switch (v) {
			case 'likely_adequate':
				return m.analytics_adequacy_likely_adequate();
			case 'uncertain':
				return m.analytics_adequacy_uncertain();
			case 'likely_inadequate':
				return m.analytics_adequacy_likely_inadequate();
			case 'no_conclusion':
				return m.analytics_adequacy_no_conclusion();
			case 'above_limit':
				return m.analytics_adequacy_above_limit();
			case 'depends_on_sex':
				return m.analytics_adequacy_depends_on_sex();
		}
	};

	const barColor = (v: AdequacyVerdict) => {
		switch (v) {
			case 'likely_adequate':
				return 'bg-green-500';
			case 'uncertain':
			case 'depends_on_sex':
			case 'above_limit':
				return 'bg-amber-400';
			case 'likely_inadequate':
				return 'bg-red-500';
			case 'no_conclusion':
				return 'bg-muted-foreground/40';
		}
	};

	const textColor = (v: AdequacyVerdict) => {
		switch (v) {
			case 'likely_adequate':
				return 'text-green-600 dark:text-green-400';
			case 'uncertain':
			case 'depends_on_sex':
			case 'above_limit':
				return 'text-amber-600 dark:text-amber-400';
			case 'likely_inadequate':
				return 'text-red-600 dark:text-red-400';
			case 'no_conclusion':
				return 'text-muted-foreground';
		}
	};

	const sexLabel = $derived.by(() => {
		if (sex === 'male') return m.analytics_sex_male();
		if (sex === 'female') return m.analytics_sex_female();
		return m.analytics_sex_unset();
	});
</script>

<InsightCard
	{loading}
	title={m.analytics_nutrient_adequacy()}
	headline={m.analytics_nutrient_adequacy_headline()}
	{confidence}
	{sampleSize}
	borderColor="border-green-500"
	skeletonClass="h-48"
>
	{#snippet children()}
		{@const nutrients = adequacyData}
		{#if nutrients.length > 0}
			<div class="space-y-2">
				{#each nutrients as nutrient (nutrient.key)}
					<div class="space-y-0.5">
						<div class="flex items-center gap-2">
							<span
								class="w-28 shrink-0 text-xs truncate text-muted-foreground"
								title={nutrient.label}
							>
								{nutrient.label}
							</span>
							<div class="relative flex-1 h-3 bg-muted/40 rounded overflow-hidden">
								<div
									class="h-full rounded {barColor(nutrient.verdict)} opacity-70"
									style="width: {Math.min(nutrient.pct, 100)}%"
								></div>
								{#if nutrient.pct > 100}
									<div class="absolute right-0 top-0 h-full w-0.5 bg-border"></div>
								{/if}
							</div>
							<span
								class="w-16 shrink-0 text-right text-xs tabular-nums {textColor(nutrient.verdict)}"
							>
								{#if nutrient.pctLow !== nutrient.pctHigh}
									{nutrient.pctLow}–{nutrient.pctHigh}%
								{:else}
									{nutrient.pct}%
								{/if}
							</span>
						</div>
						<div class="flex justify-between pl-30 text-[10px] text-muted-foreground">
							<span class={textColor(nutrient.verdict)}>{verdictLabel(nutrient.verdict)}</span>
							<span class="tabular-nums">
								{nutrient.avg}
								{nutrient.unit} · {m.analytics_adequacy_days({ days: nutrient.days.toString() })}
							</span>
						</div>
					</div>
				{/each}
				<p class="text-[11px] text-muted-foreground pt-1">
					{m.analytics_rda_basis({ sex: sexLabel })}
				</p>
				{#if sex === null}
					<p class="text-[11px] text-muted-foreground">{m.analytics_adequacy_set_sex()}</p>
				{/if}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
		{/if}
	{/snippet}
</InsightCard>
