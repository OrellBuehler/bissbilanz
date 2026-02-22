<script lang="ts">
	import { BarChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import type { MacroTotals } from '$lib/utils/nutrition';
	import * as m from '$lib/paraglide/messages';

	type DailyData = { date: string } & MacroTotals;
	type MacroKey = 'protein' | 'carbs' | 'fat' | 'fiber';

	let {
		data,
		visibleKeys
	}: {
		data: DailyData[];
		visibleKeys?: MacroKey[];
	} = $props();

	const shortLabels = $derived(data.length > 10);
	const chartData = $derived(
		data.map((d) => ({
			...d,
			dateLabel: new Date(d.date + 'T00:00:00Z').toLocaleDateString(undefined, shortLabels
				? { day: 'numeric', month: 'short' }
				: { weekday: 'short', day: 'numeric' }
			)
		}))
	);
	const tickStep = $derived(data.length > 14 ? Math.ceil(data.length / 7) : 1);
	const filteredTicks = $derived(
		chartData.filter((_, i) => i % tickStep === 0).map(d => d.dateLabel)
	);

	const config: ChartConfig = {
		protein: { label: m.macro_protein(), color: '#EF4444' },
		carbs: { label: m.macro_carbs(), color: '#F97316' },
		fat: { label: m.macro_fat(), color: '#EAB308' },
		fiber: { label: m.macro_fiber(), color: '#22C55E' }
	};

	const allSeries = [
		{ key: 'protein', label: m.macro_protein(), color: '#EF4444' },
		{ key: 'carbs', label: m.macro_carbs(), color: '#F97316' },
		{ key: 'fat', label: m.macro_fat(), color: '#EAB308' },
		{ key: 'fiber', label: m.macro_fiber(), color: '#22C55E' }
	] as const satisfies Array<{ key: MacroKey; label: string; color: string }>;

	const activeKeys = $derived<MacroKey[]>(visibleKeys ?? ['protein', 'carbs', 'fat', 'fiber']);
	const series = $derived(allSeries.filter((s) => activeKeys.includes(s.key)));

	const maxMacro = $derived(
		Math.max(
			...data.map((d) => activeKeys.reduce((sum, key) => sum + d[key], 0)),
			0
		)
	);
	const hasData = $derived(maxMacro > 0);
	const yDomain = $derived([0, Math.max(maxMacro * 1.15, 50)]);
</script>

{#if hasData}
	<ChartContainer {config} class="h-full w-full aspect-auto">
		<BarChart
			data={chartData}
			x="dateLabel"
			{series}
			{yDomain}
			seriesLayout="stack"
			tooltip={true}
			axis={true}
			grid={true}
			legend={false}
			rule={false}
			bandPadding={0.28}
			props={{
				bars: { radius: 6, strokeWidth: 0, stroke: 'none' },
				grid: { y: { class: 'stroke-muted/30 [stroke-dasharray:3_6]' } },
				xAxis: {
					ticks: filteredTicks,
					tickLabelProps: { class: 'text-[11px] fill-muted-foreground/70 font-medium' }
				},
				yAxis: {
					format: (v: number) => `${Math.round(v)}g`,
					ticks: 4,
					tickLabelProps: { class: 'text-[11px] fill-muted-foreground/70 font-medium tabular-nums' }
				},
				tooltip: {
					root: {
						variant: 'none',
						classes: {
							root: 'bg-background text-foreground border border-border/50 rounded-lg shadow-xl text-xs px-3 py-2'
						}
					},
					header: { class: 'font-medium text-foreground' },
					item: { classes: { label: 'text-muted-foreground', value: 'text-foreground font-mono font-medium tabular-nums' } }
				}
			}}
		/>
	</ChartContainer>
{:else}
	<div class="text-muted-foreground flex h-full items-center justify-center text-sm">
		{m.charts_no_data()}
	</div>
{/if}
