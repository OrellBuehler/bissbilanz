<script lang="ts">
	import { PieChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import { apiFetch } from '$lib/utils/api';
	import * as m from '$lib/paraglide/messages';

	type MealData = {
		mealType: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	};

	let { date }: { date: string } = $props();

	let data: MealData[] = $state([]);
	let loading = $state(true);

	const MEAL_COLORS: Record<string, string> = {
		Breakfast: '#F59E0B',
		Lunch: '#3B82F6',
		Dinner: '#8B5CF6',
		Snacks: '#10B981'
	};

	const DEFAULT_COLOR = '#6B7280';

	const getMealColor = (mealType: string) => MEAL_COLORS[mealType] ?? DEFAULT_COLOR;

	const fetchData = async (d: string) => {
		loading = true;
		try {
			const res = await apiFetch(`/api/stats/meal-breakdown?date=${d}`);
			if (res.ok) {
				const json = await res.json();
				data = json.data;
			}
		} catch {
			data = [];
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		fetchData(date);
	});

	const chartData = $derived(
		data
			.filter((d) => d.calories > 0)
			.map((d) => ({
				key: d.mealType,
				label: d.mealType,
				value: Math.round(d.calories)
			}))
	);

	const config = $derived(
		Object.fromEntries(
			chartData.map((d) => [d.key, { label: d.label, color: getMealColor(d.key) }])
		) as ChartConfig
	);

	const colorRange = $derived(chartData.map((d) => getMealColor(d.key)));

	const totalCalories = $derived(chartData.reduce((sum, d) => sum + d.value, 0));
	const hasData = $derived(chartData.length > 0);
</script>

<DashboardCard title={m.insights_meal_distribution()} Icon={ChartPie} tone="rose">
	{#snippet headerRight()}
		<Button variant="ghost" size="sm" href="/insights" class="text-xs">
			{m.insights_see_more()}
		</Button>
	{/snippet}
	<div class="h-[200px] sm:h-[220px]">
		{#if loading}
			<div class="text-muted-foreground flex h-full items-center justify-center text-sm">
				{m.add_food_loading()}
			</div>
		{:else if hasData}
			<ChartContainer {config} class="h-full w-full aspect-auto">
				<div class="relative h-full w-full">
					<PieChart
						data={chartData}
						key="key"
						label="label"
						value="value"
						cRange={colorRange}
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
				{m.insights_no_data()}
			</div>
		{/if}
	</div>
</DashboardCard>
