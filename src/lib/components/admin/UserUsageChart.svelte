<script lang="ts">
	import { BarChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import * as m from '$lib/paraglide/messages';
	import type { AdminUserDetail } from './admin-api';
	import { formatDayLabel, formatUsd } from './format';

	let { usage }: { usage: AdminUserDetail['dailyUsage'] } = $props();

	const COLOR = 'var(--chart-1)';

	const config = $derived<ChartConfig>({
		costUsd: { label: m.admin_user_col_cost(), color: COLOR }
	});
	const series = $derived([{ key: 'costUsd', label: m.admin_user_col_cost(), color: COLOR }]);

	const chartData = $derived(usage.map((day) => ({ ...day, label: formatDayLabel(day.date) })));
	const maxCost = $derived(Math.max(...usage.map((day) => day.costUsd), 0));
	const hasData = $derived(maxCost > 0);
	const tickEvery = $derived(Math.max(1, Math.ceil(usage.length / 7)));
	const xTicks = $derived(
		chartData.filter((_, index) => index % tickEvery === 0).map((day) => day.label)
	);
</script>

{#if hasData}
	<div class="h-[220px] sm:h-[260px]" data-testid="admin-usage-chart">
		<ChartContainer {config} class="h-full w-full aspect-auto">
			<BarChart
				data={chartData}
				x="label"
				{series}
				yDomain={[0, maxCost * 1.15]}
				tooltipContext={true}
				axis={true}
				grid={true}
				legend={false}
				rule={false}
				bandPadding={0.25}
				props={{
					bars: { radius: 4, strokeWidth: 0, stroke: 'none' },
					grid: { y: { class: 'stroke-muted/30 [stroke-dasharray:3_6]' } },
					xAxis: {
						ticks: xTicks,
						tickLabelProps: { class: 'text-[11px] fill-muted-foreground/70 font-medium' }
					},
					yAxis: {
						format: (value: number) => formatUsd(value),
						ticks: 4,
						tickLabelProps: {
							class: 'text-[11px] fill-muted-foreground/70 font-medium tabular-nums'
						}
					},
					tooltip: {
						root: {
							variant: 'none',
							classes: {
								root: 'bg-background text-foreground border border-border/50 rounded-lg shadow-xl text-xs px-3 py-2'
							}
						},
						header: { class: 'font-medium text-foreground' },
						item: {
							format: (value: number) => formatUsd(value),
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
{:else}
	<div
		class="text-muted-foreground flex h-[220px] items-center justify-center text-sm sm:h-[260px]"
	>
		{m.admin_user_calls_empty()}
	</div>
{/if}
