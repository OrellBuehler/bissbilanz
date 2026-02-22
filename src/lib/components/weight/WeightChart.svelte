<script lang="ts">
	import { LineChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import { curveMonotoneX } from 'd3-shape';
	import ChartRangeSelector from '$lib/components/charts/ChartRangeSelector.svelte';
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
				shortLabels
					? { day: 'numeric', month: 'short' }
					: { weekday: 'short', day: 'numeric' }
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

	const config: ChartConfig = {
		weightKg: { label: m.weight_actual(), color: '#8B5CF6' },
		movingAvg: { label: m.weight_trend(), color: '#F97316' }
	};

	const series = [
		{ key: 'weightKg', label: m.weight_actual(), color: '#8B5CF6' },
		{ key: 'movingAvg', label: m.weight_trend(), color: '#F97316' }
	];
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-lg font-semibold">{m.weight_chart()}</h2>
		<ChartRangeSelector {ranges} activeRange="30d" {onRangeChange} />
	</div>

	{#if hasData}
		<div class="h-64">
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
									root: 'bg-background text-foreground border border-border/50 rounded-lg shadow-xl text-xs px-3 py-2'
								}
							},
							header: { class: 'font-medium text-foreground' },
							item: {
								format: (v: number) => `${v.toFixed(1)} kg`,
								classes: {
									label: 'text-muted-foreground',
									value: 'text-foreground font-mono font-medium tabular-nums'
								}
							}
						}
					}}
				/>
			</ChartContainer>
		</div>
	{:else}
		<div class="text-muted-foreground flex h-64 items-center justify-center text-sm">
			{m.weight_no_entries()}
		</div>
	{/if}
</div>
