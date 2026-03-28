<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeOmegaRatio } from '$lib/analytics/food-quality';
	import * as m from '$lib/paraglide/messages';

	type NutrientEntry = {
		date: string;
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

	const dailyAggregates = $derived.by(() => {
		const byDate = new Map<string, { date: string; omega3: number; omega6: number }>();
		for (const entry of nutrientEntries) {
			if (!byDate.has(entry.date))
				byDate.set(entry.date, { date: entry.date, omega3: 0, omega6: 0 });
			const day = byDate.get(entry.date)!;
			day.omega3 += entry.omega3 ?? 0;
			day.omega6 += entry.omega6 ?? 0;
		}
		return [...byDate.values()];
	});

	const result = $derived.by(() => {
		if (dailyAggregates.length === 0) return null;
		return computeOmegaRatio(dailyAggregates);
	});

	const statusLabel = $derived.by(() => {
		const s = result?.status;
		if (s === 'optimal') return m.analytics_omega_optimal();
		if (s === 'elevated') return m.analytics_omega_elevated();
		if (s === 'high') return m.analytics_omega_high();
		if (s === 'critical') return m.analytics_omega_critical();
		return '';
	});

	const statusClass = $derived.by(() => {
		const s = result?.status;
		if (s === 'optimal')
			return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
		if (s === 'elevated')
			return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
		if (s === 'high')
			return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
		return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-green-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
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
								{(Math.round(result.avgOmega3 * 10) / 10).toFixed(1)}g
							</p>
						</div>
						<div>
							<p class="text-[11px] text-muted-foreground uppercase tracking-wide">Omega-6</p>
							<p class="text-sm font-semibold tabular-nums">
								{(Math.round(result.avgOmega6 * 10) / 10).toFixed(1)}g
							</p>
						</div>
					</div>
					<p class="text-xs text-muted-foreground">{m.analytics_omega_target()}</p>
				</div>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
