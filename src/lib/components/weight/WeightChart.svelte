<script lang="ts">
	import { LineChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import { curveMonotoneX } from 'd3-shape';
	import ChartRangeSelector from '$lib/components/charts/ChartRangeSelector.svelte';
	import Weight from '@lucide/svelte/icons/weight';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import History from '@lucide/svelte/icons/history';
	import * as m from '$lib/paraglide/messages';

	type ChartPoint = {
		entry_date: string;
		weight_kg: number;
		moving_avg: number | null;
	};

	let {
		data,
		onRangeChange
	}: {
		data: ChartPoint[];
		onRangeChange: (start: string, end: string) => void;
	} = $props();

	const ranges = [
		{ key: '7d', label: () => m.weight_range_7d() },
		{ key: '30d', label: () => m.weight_range_30d() },
		{ key: '90d', label: () => m.weight_range_90d() },
		{ key: 'all', label: () => m.weight_range_all() }
	];

	const shortLabels = $derived(data.length > 14);
	const chartData = $derived(
		data.map((d) => ({
			weightKg: Number(d.weight_kg),
			movingAvg: d.moving_avg ? Number(d.moving_avg) : null,
			dateLabel: new Date(d.entry_date).toLocaleDateString(
				undefined,
				shortLabels ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' }
			)
		}))
	);

	const tickStep = $derived(data.length > 14 ? Math.ceil(data.length / 7) : 1);
	const filteredTicks = $derived(
		chartData.filter((_, i) => i % tickStep === 0).map((d) => d.dateLabel)
	);

	const allWeights = $derived(data.map((d) => Number(d.weight_kg)));
	const minWeight = $derived(Math.min(...allWeights));
	const maxWeight = $derived(Math.max(...allWeights));
	const padding = $derived((maxWeight - minWeight) * 0.15 || 2);
	const yDomain = $derived([Math.floor(minWeight - padding), Math.ceil(maxWeight + padding)]);

	const hasData = $derived(data.length > 0);
	const latestPoint = $derived(data.length > 0 ? data[data.length - 1] : null);
	const firstPoint = $derived(data.length > 0 ? data[0] : null);
	const latestWeight = $derived(latestPoint ? Number(latestPoint.weight_kg) : null);
	const latestMovingAvg = $derived(
		latestPoint?.moving_avg != null ? Number(latestPoint.moving_avg) : null
	);
	const rangeDelta = $derived(
		firstPoint && latestPoint ? Number(latestPoint.weight_kg) - Number(firstPoint.weight_kg) : null
	);
	const rangeDateLabel = $derived(
		firstPoint && latestPoint
			? `${new Date(firstPoint.entry_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - ${new Date(latestPoint.entry_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
			: null
	);
	const formatWeight = (value: number | null) => (value == null ? '—' : `${value.toFixed(1)} kg`);
	const formatDelta = (value: number | null) => {
		if (value == null) return '—';
		const sign = value > 0 ? '+' : '';
		return `${sign}${value.toFixed(1)} kg`;
	};

	const config: ChartConfig = {
		weightKg: { label: m.weight_actual(), color: '#2563EB' },
		movingAvg: { label: m.weight_trend(), color: '#059669' }
	};

	const series = [
		{ key: 'weightKg', label: m.weight_actual(), color: '#2563EB' },
		{ key: 'movingAvg', label: m.weight_trend(), color: '#059669' }
	];
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div
					class="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"
				>
					<Weight class="size-4" />
				</div>
				<div class="flex flex-1 items-center gap-2">
					<h2 class="text-lg font-semibold tracking-tight">{m.weight_chart()}</h2>
					{#if rangeDateLabel}
						<p class="ml-auto text-xs text-muted-foreground">{rangeDateLabel}</p>
					{/if}
				</div>
			</div>

			{#if hasData}
				<div class="flex flex-wrap items-center gap-1.5">
					<div
						class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground"
					>
						<Weight class="size-3.5 text-blue-600 dark:text-blue-400" />
						<span>{m.weight_actual()}</span>
						<span class="font-semibold tabular-nums text-foreground"
							>{formatWeight(latestWeight)}</span
						>
					</div>
					<div
						class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground"
					>
						<Sparkles class="size-3.5 text-emerald-600 dark:text-emerald-400" />
						<span>{m.weight_trend()}</span>
						<span class="font-semibold tabular-nums text-foreground"
							>{formatWeight(latestMovingAvg)}</span
						>
					</div>
					<div
						class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground"
					>
						<History class="size-3.5" />
						<span>Δ</span>
						<span
							class={`font-semibold tabular-nums ${
								rangeDelta == null
									? 'text-foreground'
									: rangeDelta > 0
										? 'text-orange-600 dark:text-orange-400'
										: rangeDelta < 0
											? 'text-emerald-600 dark:text-emerald-400'
											: 'text-foreground'
							}`}
						>
							{formatDelta(rangeDelta)}
						</span>
					</div>
				</div>
			{/if}
		</div>

		<ChartRangeSelector {ranges} activeRange="30d" {onRangeChange} />
	</div>

	{#if hasData}
		<div
			class="relative overflow-hidden rounded-xl border border-blue-200/60 bg-gradient-to-b from-blue-50/80 via-blue-50/20 to-background p-1 dark:border-blue-900/40 dark:from-blue-950/25 dark:via-blue-950/10"
		>
			<div class="absolute -top-8 right-8 h-20 w-20 rounded-full bg-blue-500/10 blur-2xl"></div>
			<div
				class="absolute -bottom-10 left-10 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl"
			></div>
			<div class="relative rounded-[0.8rem] border border-border/60 bg-background/80 p-2 sm:p-3">
				<div class="h-64 sm:h-[18.5rem]">
					<ChartContainer {config} class="h-full w-full">
						<LineChart
							data={chartData}
							x="dateLabel"
							{series}
							{yDomain}
							tooltip={true}
							axis={true}
							grid={true}
							rule={false}
							props={{
								spline: { curve: curveMonotoneX },
								grid: { y: { class: 'stroke-muted/30 [stroke-dasharray:3_6]' } },
								xAxis: {
									ticks: filteredTicks,
									tickLabelProps: { class: 'text-[11px] fill-muted-foreground/70 font-medium' }
								},
								yAxis: {
									format: (v: number) => `${v.toFixed(1)}`,
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
										format: (v: number | null) => (v == null ? '—' : `${v.toFixed(1)} kg`),
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
			class="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/70 bg-gradient-to-b from-muted/20 to-background px-4 text-center text-sm text-muted-foreground"
		>
			<div class="flex items-center gap-2">
				<Weight class="size-4" />
				<span>{m.weight_no_entries()}</span>
			</div>
		</div>
	{/if}
</div>
