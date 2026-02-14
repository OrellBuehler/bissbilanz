<script lang="ts">
	import { BarChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import type { MacroTotals } from '$lib/utils/nutrition';
	import * as m from '$lib/paraglide/messages';

	type DailyData = { date: string } & MacroTotals;

	let { data }: { data: DailyData[] } = $props();

	const chartData = $derived(
		data.map((d) => ({
			...d,
			dateLabel: new Date(d.date + 'T00:00:00Z').toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric'
			})
		}))
	);

	const config: ChartConfig = {
		protein: { label: m.macro_protein(), color: 'hsl(0, 70%, 50%)' },
		carbs: { label: m.macro_carbs(), color: 'hsl(30, 70%, 50%)' },
		fat: { label: m.macro_fat(), color: 'hsl(50, 70%, 50%)' },
		fiber: { label: m.macro_fiber(), color: 'hsl(140, 70%, 50%)' }
	};

	const series = [
		{ key: 'protein', label: m.macro_protein(), color: 'hsl(0, 70%, 50%)' },
		{ key: 'carbs', label: m.macro_carbs(), color: 'hsl(30, 70%, 50%)' },
		{ key: 'fat', label: m.macro_fat(), color: 'hsl(50, 70%, 50%)' },
		{ key: 'fiber', label: m.macro_fiber(), color: 'hsl(140, 70%, 50%)' }
	];

	const maxMacro = $derived(
		Math.max(...data.map((d) => d.protein + d.carbs + d.fat + d.fiber), 0)
	);
	const hasData = $derived(maxMacro > 0);
	const yDomain = $derived([0, Math.max(maxMacro, 50)]);
</script>

{#if hasData}
	<ChartContainer {config} class="h-full w-full">
		<BarChart
			data={chartData}
			x="dateLabel"
			{series}
			{yDomain}
			seriesLayout="stack"
			tooltip={true}
			axis={true}
			grid={true}
			legend={true}
			rule={false}
			bandPadding={0.3}
			props={{
				yAxis: { format: (v) => `${Math.round(v)}g` }
			}}
		/>
	</ChartContainer>
{:else}
	<div class="text-muted-foreground flex h-full items-center justify-center text-sm">
		{m.charts_no_data()}
	</div>
{/if}
