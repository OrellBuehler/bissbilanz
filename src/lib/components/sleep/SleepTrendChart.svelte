<script lang="ts">
	import { BarChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import ChartRangeSelector from '$lib/components/charts/ChartRangeSelector.svelte';
	import Moon from '@lucide/svelte/icons/moon';
	import * as m from '$lib/paraglide/messages';
	import { today, daysAgo } from '$lib/utils/dates';
	import type { DexieSleepEntry } from '$lib/db/types';

	let { entries }: { entries: DexieSleepEntry[] } = $props();

	const ranges = [
		{ key: '7d', label: () => '7d' },
		{ key: '30d', label: () => '30d' },
		{ key: '90d', label: () => '90d' }
	];

	let rangeStart = $state(daysAgo(30));
	let rangeEnd = $state(today());

	const handleRangeChange = (start: string, end: string) => {
		rangeStart = start;
		rangeEnd = end;
	};

	const filtered = $derived(
		entries
			.filter((e) => e.entryDate >= rangeStart && e.entryDate <= rangeEnd)
			.sort((a, b) => a.entryDate.localeCompare(b.entryDate))
	);

	const shortLabels = $derived(filtered.length > 14);

	const chartData = $derived(
		filtered.map((e) => ({
			dateLabel: new Date(e.entryDate + 'T00:00:00Z').toLocaleDateString(
				undefined,
				shortLabels ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' }
			),
			durationHours: +(e.durationMinutes / 60).toFixed(2),
			quality: e.quality
		}))
	);

	const tickStep = $derived(chartData.length > 14 ? Math.ceil(chartData.length / 5) : 1);
	const filteredTicks = $derived(
		chartData.filter((_, i) => i % tickStep === 0).map((d) => d.dateLabel)
	);

	const avgDuration = $derived(
		filtered.length > 0
			? filtered.reduce((s, e) => s + e.durationMinutes, 0) / filtered.length / 60
			: null
	);
	const avgQuality = $derived(
		filtered.length > 0 ? filtered.reduce((s, e) => s + e.quality, 0) / filtered.length : null
	);

	const hasData = $derived(filtered.length > 0);

	const config: ChartConfig = {
		durationHours: { label: m.sleep_duration(), color: '#a78bfa' },
		quality: { label: m.sleep_quality(), color: '#c4b5fd' }
	};
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div
					class="flex size-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400"
				>
					<Moon class="size-4" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{m.sleep_trend()}</h2>
			</div>

			{#if hasData}
				<div class="flex flex-wrap items-center gap-1.5">
					{#if avgDuration != null}
						<div
							class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground"
						>
							<Moon class="size-3.5 text-purple-600 dark:text-purple-400" />
							<span>{m.sleep_duration()}</span>
							<span class="font-semibold tabular-nums text-foreground">
								{m.sleep_hours({
									hours: String(Math.floor(avgDuration)),
									minutes: String(Math.round((avgDuration % 1) * 60))
								})}
							</span>
						</div>
					{/if}
					{#if avgQuality != null}
						<div
							class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground"
						>
							<span>{m.sleep_quality()}</span>
							<span class="font-semibold tabular-nums text-foreground"
								>{avgQuality.toFixed(1)}/10</span
							>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<ChartRangeSelector {ranges} activeRange="30d" onRangeChange={handleRangeChange} />
	</div>

	{#if hasData}
		<div class="relative overflow-hidden rounded-xl border border-border/40 bg-card p-1">
			<div class="absolute -top-8 right-8 h-20 w-20 rounded-full bg-purple-500/10 blur-2xl"></div>
			<div class="relative rounded-[0.8rem] border border-border/60 bg-background/80 p-2 sm:p-3">
				<div class="h-64 sm:h-[18.5rem]">
					<ChartContainer {config} class="h-full w-full">
						<BarChart
							data={chartData}
							x="dateLabel"
							y="durationHours"
							padding={{ left: 36, bottom: 24 }}
							tooltip={true}
							axis={true}
							grid={true}
							props={{
								bars: { fill: '#a78bfa', 'fill-opacity': 0.85 },
								grid: { y: { class: 'stroke-muted/30 [stroke-dasharray:3_6]' } },
								xAxis: {
									ticks: filteredTicks,
									tickLabelProps: { class: 'text-[11px] fill-muted-foreground/70 font-medium' }
								},
								yAxis: {
									format: (v: number) => `${v.toFixed(1)}h`,
									ticks: 5,
									tickLabelProps: {
										class: 'text-[11px] fill-muted-foreground/70 font-medium tabular-nums'
									}
								},
								tooltip: {
									hideTotal: true,
									root: {
										variant: 'none',
										classes: {
											root: 'bg-background/95 text-foreground border border-border/60 rounded-xl shadow-xl shadow-black/5 text-xs px-3 py-2 backdrop-blur'
										}
									},
									header: { class: 'font-medium text-foreground' },
									item: {
										format: (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}h`),
										classes: {
											label: 'text-muted-foreground',
											value: 'text-foreground font-medium tabular-nums'
										}
									}
								}
							}}
						/>
					</ChartContainer>
				</div>
			</div>
		</div>
	{:else}
		<div
			class="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 text-center text-sm text-muted-foreground"
		>
			<div class="flex items-center gap-2">
				<Moon class="size-4" />
				<span>{m.sleep_no_entries()}</span>
			</div>
		</div>
	{/if}
</div>
