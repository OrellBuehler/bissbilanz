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
</script>

<ChartContainer {config} class="h-full w-full">
	<BarChart
		data={chartData}
		x="dateLabel"
		{series}
		seriesLayout="stack"
		tooltip={true}
		axis={true}
		grid={true}
		legend={true}
		rule={false}
		bandPadding={0.3}
	/>
</ChartContainer>
