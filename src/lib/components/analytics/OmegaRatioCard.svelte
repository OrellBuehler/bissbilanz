<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeOmegaRatio } from '$lib/analytics/food-quality';
	import { aggregateEntriesByDay } from '$lib/analytics/daily-coverage';
	import { formatNutrient } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';

	type NutrientEntry = {
		date: string;
		calories: number;
		omega3: number | null;
		omega6: number | null;
	};

	let {
		nutrientEntries,
		loading
	}: {
		nutrientEntries: NutrientEntry[];
		loading: boolean;
	} = $props();

	const dailyAggregates = $derived.by(() =>
		aggregateEntriesByDay(nutrientEntries, ['omega3', 'omega6'] as const).map((day) => ({
			date: day.date,
			omega3: day.values.omega3 ?? 0,
			omega6: day.values.omega6 ?? 0,
			coverage: Math.min(day.coverage.omega3, day.coverage.omega6)
		}))
	);

	const result = $derived.by(() => {
		if (dailyAggregates.length === 0) return null;
		return computeOmegaRatio(dailyAggregates);
	});

	const statusLabel = $derived.by(() => {
		const s = result?.status;
		if (s === 'optimal') return m.analytics_omega_optimal();
		if (s === 'elevated') return m.analytics_omega_elevated();
		if (s === 'high') return m.analytics_omega_high();
		return '';
	});

	const statusClass = $derived.by(() => {
		const s = result?.status;
		if (s === 'optimal')
			return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
		if (s === 'elevated')
			return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
		return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
	});
</script>

<InsightCard
	{loading}
	title={m.analytics_omega()}
	headline={result?.ratio != null
		? m.analytics_omega_headline({ ratio: (Math.round(result.ratio * 10) / 10).toString() })
		: m.analytics_omega_no_data()}
	confidence={result?.confidence ?? 'insufficient'}
	sampleSize={result?.sampleSize ?? 0}
	borderColor="border-green-500"
>
	{#snippet children()}
		{#if result?.ratio != null}
			<div class="space-y-3">
				<div class="flex items-center gap-2">
					<span class="rounded-full px-2 py-0.5 text-[11px] font-medium {statusClass}">
						{statusLabel}
					</span>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<p class="text-[11px] text-muted-foreground uppercase tracking-wide">Omega-3</p>
						<p class="text-sm font-semibold tabular-nums">
							{formatNutrient(result.avgOmega3, 'g')}
						</p>
					</div>
					<div>
						<p class="text-[11px] text-muted-foreground uppercase tracking-wide">Omega-6</p>
						<p class="text-sm font-semibold tabular-nums">
							{formatNutrient(result.avgOmega6, 'g')}
						</p>
					</div>
				</div>
				<p class="text-xs text-muted-foreground">{m.analytics_omega_target()}</p>
			</div>
		{/if}
	{/snippet}
</InsightCard>
