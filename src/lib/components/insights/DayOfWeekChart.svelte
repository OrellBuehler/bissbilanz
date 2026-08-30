<script lang="ts">
	import { BarChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { MACRO_COLORS } from '$lib/colors';
	import { today, shiftDate } from '$lib/utils/dates';
	import { statsService } from '$lib/services/stats-service.svelte';
	import type { MacroKey, DayRow, Goals } from '$lib/utils/insights';
	import * as m from '$lib/paraglide/messages';

	let { initialData }: { initialData?: { data: DayRow[]; goals: Goals | null } } = $props();

	type RangeKey = '4w' | '12w';
	let range: RangeKey = $state('4w');
	let metric: MacroKey = $state('calories');
	let data: DayRow[] = $state(initialData?.data ?? []);
	let goals = $state<Goals | null>(initialData?.goals ?? null);
	let loading = $state(!initialData);
	let refreshing = $state(false);

	const rangeDays: Record<RangeKey, number> = { '4w': 27, '12w': 83 };

	const macroLabels: Record<MacroKey, () => string> = {
		calories: () => m.macro_calories(),
		protein: () => m.macro_protein(),
		carbs: () => m.macro_carbs(),
		fat: () => m.macro_fat(),
		fiber: () => m.macro_fiber()
	};

	const rangeLabels: Record<RangeKey, () => string> = {
		'4w': () => m.insights_dow_4w(),
		'12w': () => m.insights_dow_12w()
	};

	const goalMap = $derived<Record<MacroKey, number>>(
		goals
			? {
					calories: goals.calorieGoal,
					protein: goals.proteinGoal,
					carbs: goals.carbGoal,
					fat: goals.fatGoal,
					fiber: goals.fiberGoal
				}
			: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
	);

	const fetchData = async (r: RangeKey) => {
		refreshing = true;
		try {
			const end = today();
			const start = shiftDate(end, -rangeDays[r]);
			const result = await statsService.getDailyStatus(start, end);
			if (result) {
				data = result.data;
				goals = result.goals;
			}
		} catch {
			data = [];
		} finally {
			loading = false;
			refreshing = false;
		}
	};

	let initialized = !!initialData;
	$effect(() => {
		const r = range;
		if (initialized && r === '4w') {
			initialized = false;
			return;
		}
		initialized = false;
		fetchData(r);
	});

	const DOW_LABELS = [
		() => m.calendar_mon(),
		() => m.calendar_tue(),
		() => m.calendar_wed(),
		() => m.calendar_thu(),
		() => m.calendar_fri(),
		() => m.calendar_sat(),
		() => m.calendar_sun()
	];

	const chartData = $derived.by(() => {
		const buckets: Record<number, { sum: number; count: number }> = {};
		for (let i = 0; i < 7; i++) {
			buckets[i] = { sum: 0, count: 0 };
		}
		for (const d of data) {
			if (d[metric] === 0) continue;
			const dow = new Date(d.date + 'T00:00:00Z').getUTCDay();
			const mondayBased = dow === 0 ? 6 : dow - 1;
			buckets[mondayBased].sum += d[metric];
			buckets[mondayBased].count++;
		}
		return DOW_LABELS.map((label, i) => ({
			day: label(),
			value: buckets[i].count > 0 ? Math.round(buckets[i].sum / buckets[i].count) : 0
		}));
	});

	const config = $derived<ChartConfig>({
		value: { label: macroLabels[metric](), color: MACRO_COLORS[metric] }
	});

	const series = $derived([
		{ key: 'value', label: macroLabels[metric](), color: MACRO_COLORS[metric] }
	]);

	const goalForMetric = $derived(goalMap[metric]);
	const maxVal = $derived(Math.max(...chartData.map((d) => d.value), 0));
	const hasData = $derived(maxVal > 0);
	const yMax = $derived(Math.max(maxVal, goalForMetric || 0) * 1.15 || 100);

	const annotations = $derived(
		goalForMetric
			? [
					{
						type: 'line' as const,
						y: goalForMetric,
						stroke: 'hsl(var(--muted-foreground) / 0.4)',
						strokeWidth: 1.5,
						'stroke-dasharray': '6 4'
					}
				]
			: []
	);

	const isUnit = $derived(metric === 'calories' ? 'kcal' : 'g');
</script>

<div class="space-y-3">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex flex-wrap gap-1">
			{#each ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const as key (key)}
				<Button
					variant={metric === key ? 'default' : 'outline'}
					size="sm"
					onclick={() => (metric = key)}
					style={metric === key
						? `background-color: ${MACRO_COLORS[key]}; border-color: ${MACRO_COLORS[key]}`
						: `color: ${MACRO_COLORS[key]}; border-color: ${MACRO_COLORS[key]}`}
				>
					{macroLabels[key]()}
				</Button>
			{/each}
		</div>
		<div class="flex gap-1">
			{#each ['4w', '12w'] as const as r (r)}
				<Button variant={range === r ? 'default' : 'outline'} size="sm" onclick={() => (range = r)}>
					{rangeLabels[r]()}
				</Button>
			{/each}
		</div>
	</div>

	{#if loading}
		<div class="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
			{m.add_food_loading()}
		</div>
	{:else if hasData}
		<div class="h-[220px] sm:h-[260px] transition-opacity" class:opacity-60={refreshing}>
			<ChartContainer {config} class="h-full w-full aspect-auto">
				<BarChart
					data={chartData}
					x="day"
					{series}
					{annotations}
					yDomain={[0, yMax]}
					tooltipContext={true}
					axis={true}
					grid={true}
					legend={false}
					rule={false}
					bandPadding={0.3}
					props={{
						bars: { radius: 6, strokeWidth: 0, stroke: 'none' },
						grid: { y: { class: 'stroke-muted/30 [stroke-dasharray:3_6]' } },
						xAxis: {
							tickLabelProps: { class: 'text-[11px] fill-muted-foreground/70 font-medium' }
						},
						yAxis: {
							format: (v: number) =>
								metric === 'calories' && v >= 1000
									? `${(v / 1000).toFixed(1)}k`
									: `${Math.round(v)}${isUnit}`,
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
			{m.insights_no_data()}
		</div>
	{/if}
</div>
