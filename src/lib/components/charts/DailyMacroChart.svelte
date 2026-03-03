<script lang="ts">
	import { PieChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import type { MacroTotals } from '$lib/utils/nutrition';
	import { MACRO_COLORS } from '$lib/colors';
	import * as m from '$lib/paraglide/messages';

	let { totals }: { totals: MacroTotals } = $props();

	const config: ChartConfig = {
		protein: { label: m.macro_protein(), color: MACRO_COLORS.protein },
		carbs: { label: m.macro_carbs(), color: MACRO_COLORS.carbs },
		fat: { label: m.macro_fat(), color: MACRO_COLORS.fat },
		fiber: { label: m.macro_fiber(), color: MACRO_COLORS.fiber }
	};

	const chartData = $derived(
		[
			{ key: 'protein', label: m.macro_protein(), value: Math.round(totals.protein * 10) / 10 },
			{ key: 'carbs', label: m.macro_carbs(), value: Math.round(totals.carbs * 10) / 10 },
			{ key: 'fat', label: m.macro_fat(), value: Math.round(totals.fat * 10) / 10 },
			{ key: 'fiber', label: m.macro_fiber(), value: Math.round(totals.fiber * 10) / 10 }
		].filter((d) => d.value > 0)
	);

	const hasData = $derived(chartData.length > 0);
	const totalCalories = $derived(Math.round(totals.calories));
</script>

{#if hasData}
	<ChartContainer {config} class="h-full w-full aspect-auto">
		<div class="relative h-full w-full">
			<PieChart
				data={chartData}
				key="key"
				label="label"
				value="value"
				cRange={[MACRO_COLORS.protein, MACRO_COLORS.carbs, MACRO_COLORS.fat, MACRO_COLORS.fiber]}
				innerRadius={0.6}
				cornerRadius={4}
				padAngle={0.02}
				legend={true}
				tooltip={true}
				props={{
					tooltip: {
						root: {
							variant: 'none',
							classes: {
								root: 'bg-background text-foreground border border-border/50 rounded-lg shadow-xl text-xs px-3 py-2'
							}
						},
						header: { class: 'font-medium text-foreground' },
						item: {
							classes: {
								label: 'text-muted-foreground',
								value: 'text-foreground font-medium tabular-nums'
							}
						}
					}
				}}
			/>
			<div
				class="pointer-events-none absolute inset-0 bottom-8 flex flex-col items-center justify-center"
			>
				<span class="text-2xl font-bold tabular-nums text-foreground">{totalCalories}</span>
				<span class="text-xs text-muted-foreground">{m.foods_kcal()}</span>
			</div>
		</div>
	</ChartContainer>
{:else}
	<div class="text-muted-foreground flex h-full items-center justify-center text-sm">
		{m.charts_no_data()}
	</div>
{/if}
