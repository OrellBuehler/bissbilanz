<script lang="ts">
	import { AreaChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import { curveMonotoneX } from 'd3-shape';
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
		calories: {
			label: m.macro_calories(),
			color: '#3B82F6'
		}
	};

	const series = [{ key: 'calories', label: m.macro_calories(), color: '#3B82F6' }];

	const maxCalories = $derived(Math.max(...data.map((d) => d.calories), 0));
	const hasData = $derived(maxCalories > 0);

	const goalInRange = $derived(calorieGoal && maxCalories >= calorieGoal * 0.25);
	const yMax = $derived(
		goalInRange
			? Math.max(maxCalories, calorieGoal!) * 1.15
			: maxCalories * 1.3 || 100
	);
	const yDomain = $derived([0, yMax]);

	const annotations = $derived(
		goalInRange
			? [
					{
						type: 'line' as const,
						y: calorieGoal!,
						stroke: 'hsl(var(--muted-foreground) / 0.4)',
						strokeWidth: 1.5,
						'stroke-dasharray': '6 4'
					}
				]
			: []
	);
</script>

{#if hasData}
	<ChartContainer {config} class="h-full w-full aspect-auto">
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
				area: { fillOpacity: 0.2, curve: curveMonotoneX },
				line: { strokeWidth: 2.5 },
				grid: { y: { class: 'stroke-muted/30 [stroke-dasharray:3_6]' } },
				xAxis: {
					ticks: filteredTicks,
					tickLabelProps: { class: 'text-[11px] fill-muted-foreground/70 font-medium' }
				},
				yAxis: {
					format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString(),
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
