<script lang="ts">
	import { AreaChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import type { MacroTotals } from '$lib/utils/nutrition';
	import * as m from '$lib/paraglide/messages';

	type DailyData = { date: string } & MacroTotals;

	let {
		data,
		calorieGoal
	}: {
		data: DailyData[];
		calorieGoal?: number;
	} = $props();

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
		calories: {
			label: m.macro_calories(),
			color: 'var(--color-chart-1)'
		}
	};

	const series = [{ key: 'calories', label: m.macro_calories(), color: 'var(--color-chart-1)' }];

	const annotations = $derived(
		calorieGoal
			? [
					{
						type: 'line' as const,
						y: calorieGoal,
						style: 'stroke-dasharray: 6 4; stroke: hsl(var(--muted-foreground)); stroke-width: 1.5;'
					}
				]
			: []
	);
</script>

<ChartContainer {config} class="h-full w-full">
	<AreaChart
		data={chartData}
		x="dateLabel"
		{series}
		{annotations}
		tooltip={true}
		axis={true}
		grid={true}
		rule={false}
		props={{
			area: { fillOpacity: 0.3 },
			grid: { y: { style: 'stroke-dasharray: 3 3;' } }
		}}
	/>
</ChartContainer>
