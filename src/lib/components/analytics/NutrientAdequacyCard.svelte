<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import type { AdequacyVerdict } from '$lib/analytics/nutrient-reference';
	import type { components } from '$lib/api/generated/schema';
	import * as m from '$lib/paraglide/messages';

	type NutrientGapsReport = components['schemas']['NutrientGapsResponse'];

	type Props = {
		report: NutrientGapsReport | null;
		loading: boolean;
	};

	let { report, loading }: Props = $props();

	// The whole assessment — coverage gating, sex-specific references, goal overrides —
	// happens server-side in /api/analytics/nutrient-gaps, so this card only renders it.
	const nutrients = $derived(report?.nutrients ?? []);
	const unmeasured = $derived(report?.unmeasured ?? []);
	const sex = $derived(report?.biologicalSex ?? null);
	const sampleSize = $derived(report?.days ?? 0);
	const confidence = $derived(getConfidenceLevel(sampleSize));

	const round = (value: number) => Math.round(value * 10) / 10;

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
		{#if nutrients.length > 0 || unmeasured.length > 0}
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
								{#if Math.round(nutrient.pctLow) !== Math.round(nutrient.pctHigh)}
									{Math.round(nutrient.pctLow)}–{Math.round(nutrient.pctHigh)}%
								{:else}
									{Math.round(nutrient.pct)}%
								{/if}
							</span>
						</div>
						<div class="flex justify-between pl-30 text-[10px] text-muted-foreground">
							<span class={textColor(nutrient.verdict)}>{verdictLabel(nutrient.verdict)}</span>
							<span class="tabular-nums">
								{round(nutrient.avgIntake)}
								{nutrient.unit} · {m.analytics_adequacy_days({
									days: nutrient.daysMeasured.toString()
								})}
							</span>
						</div>
					</div>
				{/each}

				{#if unmeasured.length > 0}
					<!-- Shown rather than filtered away: a nutrient nothing measured is unknown,
					     not adequate, and hiding it reads as a clean bill of health. -->
					<div class="pt-2 border-t space-y-1">
						<p class="text-[11px] font-medium text-muted-foreground">
							{m.analytics_adequacy_unmeasured({ count: unmeasured.length.toString() })}
						</p>
						<p class="text-[10px] text-muted-foreground">
							{unmeasured.map((n) => n.label).join(', ')}
						</p>
						<p class="text-[10px] text-muted-foreground">
							{m.analytics_adequacy_unmeasured_hint()}
						</p>
					</div>
				{/if}

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
