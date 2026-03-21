<script lang="ts">
	import { BarChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { MACRO_COLORS } from '$lib/colors';
	import { today, shiftDate } from '$lib/utils/dates';
	import { statsService } from '$lib/services/stats-service.svelte';
	import * as m from '$lib/paraglide/messages';

	type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';
	type DayRow = {
		date: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	};
	type Goals = {
		calorieGoal: number;
		proteinGoal: number;
		carbGoal: number;
		fatGoal: number;
		fiberGoal: number;
	} | null;

	let { initialData }: { initialData?: { data: DayRow[]; goals: Goals | null } } = $props();

	type RangeKey = '7d' | '30d' | '90d';
	let range: RangeKey = $state('7d');
	let metric: MacroKey = $state('calories');
	let data: DayRow[] = $state(initialData?.data ?? []);
	let goals = $state<Goals>(initialData?.goals ?? null);
	let loading = $state(!initialData);

	const macroLabels: Record<MacroKey, () => string> = {
		calories: () => m.macro_calories(),
		protein: () => m.macro_protein(),
		carbs: () => m.macro_carbs(),
		fat: () => m.macro_fat(),
		fiber: () => m.macro_fiber()
	};

	const rangeLabels: Record<RangeKey, () => string> = {
		'7d': () => m.insights_7d(),
		'30d': () => m.insights_30d(),
		'90d': () => m.insights_90d()
	};

	const rangeDays: Record<RangeKey, number> = { '7d': 6, '30d': 29, '90d': 89 };

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
	const goalForMetric = $derived(goalMap[metric]);

	const fetchData = async (r: RangeKey) => {
		loading = true;
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
		}
	};

	let initialized = !!initialData;
	$effect(() => {
		const r = range;
		if (initialized && r === '7d') {
			initialized = false;
			return;
		}
		initialized = false;
		fetchData(r);
	});

	const shortLabels = $derived(data.length > 10);
	const chartData = $derived(
		data.map((d) => ({
			...d,
			dateLabel: new Date(d.date + 'T00:00:00Z').toLocaleDateString(
				undefined,
				shortLabels ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' }
			)
		}))
	);

	const config = $derived<ChartConfig>({
		[metric]: { label: macroLabels[metric](), color: MACRO_COLORS[metric] }
	});

	const series = $derived([
		{ key: metric, label: macroLabels[metric](), color: MACRO_COLORS[metric] }
	]);

	const maxVal = $derived(Math.max(...data.map((d) => d[metric]), 0));
	const hasData = $derived(maxVal > 0);
	const yMax = $derived(Math.max(maxVal, goalForMetric || 0) * 1.15 || 100);

	const tickStep = $derived(data.length > 14 ? Math.ceil(data.length / 7) : 1);
	const filteredTicks = $derived(
		chartData.filter((_, i) => i % tickStep === 0).map((d) => d.dateLabel)
	);

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
			{#each ['7d', '30d', '90d'] as const as r (r)}
				<Button variant={range === r ? 'default' : 'outline'} size="sm" onclick={() => (range = r)}>
					{rangeLabels[r]()}
				</Button>
			{/each}
		</div>
	</div>

	{#if loading}
		<div class="text-muted-foreground flex h-[250px] items-center justify-center text-sm">
			{m.add_food_loading()}
		</div>
	{:else if hasData}
		<div class="h-[250px] sm:h-[300px]">
			<ChartContainer {config} class="h-full w-full aspect-auto">
				<BarChart
					data={chartData}
					x="dateLabel"
					{series}
					{annotations}
					yDomain={[0, yMax]}
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
		<div class="text-muted-foreground flex h-[250px] items-center justify-center text-sm">
			{m.insights_no_data()}
		</div>
	{/if}
</div>
