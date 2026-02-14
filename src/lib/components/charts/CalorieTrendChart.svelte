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

	const maxCalories = $derived(Math.max(...data.map((d) => d.calories), 0));
	const hasData = $derived(maxCalories > 0);
	const yDomain = $derived([0, Math.max(maxCalories, calorieGoal ?? 100, 100)]);

	const annotations = $derived(
		calorieGoal
			? [
					{
						type: 'line' as const,
						y: calorieGoal,
						stroke: 'hsl(var(--muted-foreground))',
						strokeWidth: 1.5,
						'stroke-dasharray': '6 4'
					}
				]
			: []
	);
</script>

{#if hasData}
	<ChartContainer {config} class="h-full w-full">
		<AreaChart
			data={chartData}
			x="dateLabel"
			{series}
			{annotations}
			{yDomain}
			tooltip={true}
			axis={true}
			grid={true}
			rule={false}
			props={{
				area: { fillOpacity: 0.3 },
				grid: { y: { style: 'stroke-dasharray: 3 3;' } },
				yAxis: { format: (v) => Math.round(v).toLocaleString() }
			}}
		/>
	</ChartContainer>
{:else}
	<div class="text-muted-foreground flex h-full items-center justify-center text-sm">
		{m.charts_no_data()}
	</div>
{/if}
