<script lang="ts">
	import { PieChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import CollapsibleCard from '$lib/components/ui/collapsible-card/CollapsibleCard.svelte';
	import TrendsChart from '$lib/components/insights/TrendsChart.svelte';
	import GoalAdherence from '$lib/components/insights/GoalAdherence.svelte';
	import CalendarHeatmap from '$lib/components/insights/CalendarHeatmap.svelte';
	import MacroRadar from '$lib/components/insights/MacroRadar.svelte';
	import WeightLogForm from '$lib/components/weight/WeightLogForm.svelte';
	import WeightChart from '$lib/components/weight/WeightChart.svelte';
	import WeightHistoryList from '$lib/components/weight/WeightHistoryList.svelte';
	import SleepTabContent from '$lib/components/sleep/SleepTabContent.svelte';
	import CaloricLagCard from '$lib/components/analytics/CaloricLagCard.svelte';
	import MacroImpactCard from '$lib/components/analytics/MacroImpactCard.svelte';
	import MealTimingWeightCard from '$lib/components/analytics/MealTimingWeightCard.svelte';
	import MicronutrientGapsCard from '$lib/components/analytics/MicronutrientGapsCard.svelte';
	import EatingWindowCard from '$lib/components/analytics/EatingWindowCard.svelte';
	import MealSpacingCard from '$lib/components/analytics/MealSpacingCard.svelte';
	import NutrientAdequacyCard from '$lib/components/analytics/NutrientAdequacyCard.svelte';
	import Weight from '@lucide/svelte/icons/weight';
	import History from '@lucide/svelte/icons/history';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { today, shiftDate, daysAgo } from '$lib/utils/dates';
	import { statsService } from '$lib/services/stats-service.svelte';
	import { weightService } from '$lib/services/weight-service.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { MACRO_COLORS, MEAL_COLORS } from '$lib/colors';
	import * as m from '$lib/paraglide/messages';
	import type { DexieWeightEntry } from '$lib/db/types';
	import type { PageData } from './$types';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api/client';

	let { data: pageData }: { data: PageData } = $props();

	type Tab = 'nutrition' | 'weight' | 'sleep';
	const activeTab = $derived<Tab>(($page.url.searchParams.get('tab') as Tab) ?? 'nutrition');

	const setTab = (tab: Tab) => {
		const url = new URL($page.url);
		url.searchParams.set('tab', tab);
		goto(url.toString(), { replaceState: false, noScroll: true });
	};

	const tabs = [
		{ id: 'nutrition' as Tab, label: m.insights_tab_nutrition },
		{ id: 'weight' as Tab, label: m.insights_tab_weight },
		{ id: 'sleep' as Tab, label: m.insights_tab_sleep }
	];

	// --- Nutrition tab state ---

	type MealData = {
		mealType: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	};

	type TopFood = {
		foodId: string | null;
		recipeId: string | null;
		foodName: string;
		count: number;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	};

	type Range = 'today' | '7d' | '30d';
	let range: Range = $state('today');
	let data: MealData[] = $state(pageData.mealBreakdown);
	let mealLoading = $state(false);

	let topFoodsDays = $state(7);
	let foods: TopFood[] = $state(pageData.topFoods);
	let topFoodsLoading = $state(false);

	const DEFAULT_COLOR = '#6B7280';
	const getMealColor = (mealType: string) => MEAL_COLORS[mealType] ?? DEFAULT_COLOR;

	const fetchData = async (r: Range) => {
		mealLoading = true;
		try {
			const todayStr = today();
			const query: { date?: string; startDate?: string; endDate?: string } = {};
			if (r === 'today') {
				query.date = todayStr;
			} else {
				const days = r === '7d' ? 6 : 29;
				query.startDate = shiftDate(todayStr, -days);
				query.endDate = todayStr;
			}
			const result = await statsService.getMealBreakdown(query);
			if (result) {
				data = result.data;
			}
		} catch {
			data = [];
		} finally {
			mealLoading = false;
		}
	};

	const loadTopFoods = async () => {
		topFoodsLoading = true;
		try {
			const result = await statsService.getTopFoods(topFoodsDays, 10);
			if (result) {
				foods = result.data;
			}
		} catch {
			// silently ignore
		} finally {
			topFoodsLoading = false;
		}
	};

	let mealInitialized = true;
	$effect(() => {
		const r = range;
		if (mealInitialized && r === 'today') {
			mealInitialized = false;
			return;
		}
		mealInitialized = false;
		fetchData(r);
	});

	let topFoodsInitialized = true;
	$effect(() => {
		const d = topFoodsDays;
		if (topFoodsInitialized && d === 7) {
			topFoodsInitialized = false;
			return;
		}
		topFoodsInitialized = false;
		loadTopFoods();
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

	const rangeLabel = (r: Range) => {
		if (r === 'today') return m.insights_today();
		if (r === '7d') return m.insights_7d();
		return m.insights_30d();
	};

	// --- Weight tab state ---

	type ChartPoint = {
		entry_date: string;
		weight_kg: number;
		moving_avg: number | null;
	};

	const live = useLiveQuery(() => weightService.entries(), [] as DexieWeightEntry[]);
	const entries = $derived(live.value);

	let weightChartData = $state<ChartPoint[]>(pageData.initialChartData as ChartPoint[]);
	let weightLoading = $state(false);

	let chartFrom = $state(daysAgo(30));
	let chartTo = $state(today());

	const latestEntry = $derived(entries[0] ?? null);
	const latestTrend = $derived(
		[...weightChartData].reverse().find((point) => point.moving_avg != null)?.moving_avg ?? null
	);
	const formatKg = (value: number | null) => (value == null ? '—' : `${value.toFixed(1)} kg`);

	const loadWeightChart = async () => {
		const { data: apiData } = await api.GET('/api/weight', {
			params: { query: { from: chartFrom, to: chartTo } }
		});
		if (apiData && 'data' in apiData) {
			weightChartData = apiData.data;
		}
	};

	const handleRangeChange = (from: string, to: string) => {
		chartFrom = from;
		chartTo = to;
		loadWeightChart();
	};

	$effect(() => {
		weightService.refresh();
	});
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<div class="flex gap-1">
		{#each tabs as tab}
			<Button
				variant={activeTab === tab.id ? 'default' : 'outline'}
				size="sm"
				onclick={() => setTab(tab.id)}
			>
				{tab.label()}
			</Button>
		{/each}
	</div>

	{#if activeTab === 'nutrition'}
		<CollapsibleCard title={m.insights_trends()} sectionId="trends">
			<TrendsChart initialData={pageData.dailyStatus} />
		</CollapsibleCard>

		<CollapsibleCard title={m.insights_goal_adherence()} sectionId="adherence">
			<GoalAdherence initialData={pageData.dailyStatus} />
		</CollapsibleCard>

		<CollapsibleCard title={m.insights_calendar()} sectionId="calendar">
			<CalendarHeatmap initialDays={pageData.calendarDays} />
		</CollapsibleCard>

		<CollapsibleCard title={m.insights_macro_balance()} sectionId="radar">
			<MacroRadar initialData={pageData.dailyStatus} />
		</CollapsibleCard>

		<CollapsibleCard title={m.insights_meal_distribution()} sectionId="meals">
			<div class="space-y-3">
				<div class="flex justify-end">
					<div class="flex gap-1">
						{#each ['today', '7d', '30d'] as r (r)}
							<Button
								variant={range === r ? 'default' : 'outline'}
								size="sm"
								onclick={() => (range = r as Range)}
							>
								{rangeLabel(r as Range)}
							</Button>
						{/each}
					</div>
				</div>

				{#if mealLoading}
					<div
						class="text-muted-foreground flex h-[250px] items-center justify-center text-sm sm:h-[300px]"
					>
						{m.add_food_loading()}
					</div>
				{:else if hasData}
					<div class="flex flex-col gap-6 md:flex-row md:items-start">
						<div class="h-[250px] w-full sm:h-[300px] md:w-1/2">
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
										<span class="text-3xl font-bold tabular-nums text-foreground"
											>{totalCalories}</span
										>
										<span class="text-xs text-muted-foreground">{m.foods_kcal()}</span>
									</div>
								</div>
							</ChartContainer>
						</div>

						<div class="w-full md:w-1/2">
							<div class="space-y-3 sm:hidden">
								{#each data.filter((d) => d.calories > 0) as row (row.mealType)}
									{@const pct =
										totalCalories > 0 ? Math.round((row.calories / totalCalories) * 100) : 0}
									<div class="rounded-lg border p-3">
										<div class="flex items-center justify-between">
											<div class="flex items-center gap-2">
												<div
													class="h-3 w-3 rounded-full"
													style="background-color: {getMealColor(row.mealType)}"
												></div>
												<span class="text-sm font-medium">{row.mealType}</span>
											</div>
											<span class="text-muted-foreground text-xs tabular-nums">{pct}%</span>
										</div>
										<div class="mt-2 flex items-baseline gap-2">
											<span class="text-sm font-semibold tabular-nums"
												>{Math.round(row.calories)} kcal</span
											>
										</div>
										<div class="mt-1.5 flex gap-3 text-xs tabular-nums">
											<span style="color: {MACRO_COLORS.protein}">{Math.round(row.protein)}g P</span
											>
											<span style="color: {MACRO_COLORS.carbs}">{Math.round(row.carbs)}g C</span>
											<span style="color: {MACRO_COLORS.fat}">{Math.round(row.fat)}g F</span>
											<span style="color: {MACRO_COLORS.fiber}">{Math.round(row.fiber)}g Fi</span>
										</div>
									</div>
								{/each}
							</div>
							<div class="hidden sm:block">
								<table class="w-full text-sm">
									<thead>
										<tr class="text-muted-foreground border-b text-left">
											<th class="pb-2 font-medium">{m.insights_meal()}</th>
											<th class="pb-2 text-right font-medium">{m.macro_calories()}</th>
											<th class="pb-2 text-right font-medium">{m.macro_protein()}</th>
											<th class="pb-2 text-right font-medium">{m.macro_carbs()}</th>
											<th class="pb-2 text-right font-medium">{m.macro_fat()}</th>
											<th class="pb-2 text-right font-medium">{m.macro_fiber()}</th>
											<th class="pb-2 text-right font-medium">%</th>
										</tr>
									</thead>
									<tbody>
										{#each data.filter((d) => d.calories > 0) as row (row.mealType)}
											{@const pct =
												totalCalories > 0 ? Math.round((row.calories / totalCalories) * 100) : 0}
											<tr class="border-b last:border-0">
												<td class="py-2">
													<div class="flex items-center gap-2">
														<div
															class="h-3 w-3 rounded-full"
															style="background-color: {getMealColor(row.mealType)}"
														></div>
														{row.mealType}
													</div>
												</td>
												<td class="py-2 text-right tabular-nums">{Math.round(row.calories)}</td>
												<td class="py-2 text-right tabular-nums">{Math.round(row.protein)}g</td>
												<td class="py-2 text-right tabular-nums">{Math.round(row.carbs)}g</td>
												<td class="py-2 text-right tabular-nums">{Math.round(row.fat)}g</td>
												<td class="py-2 text-right tabular-nums">{Math.round(row.fiber)}g</td>
												<td class="text-muted-foreground py-2 text-right tabular-nums">{pct}%</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					</div>
				{:else}
					<div
						class="text-muted-foreground flex h-[250px] items-center justify-center text-sm sm:h-[300px]"
					>
						{m.insights_no_data()}
					</div>
				{/if}
			</div>
		</CollapsibleCard>

		<CollapsibleCard title={m.insights_top_foods()} sectionId="topfoods">
			<div class="space-y-3">
				<div class="flex justify-end">
					<div class="flex gap-1">
						<Button
							variant={topFoodsDays === 7 ? 'default' : 'outline'}
							size="sm"
							onclick={() => (topFoodsDays = 7)}
						>
							{m.insights_7d()}
						</Button>
						<Button
							variant={topFoodsDays === 30 ? 'default' : 'outline'}
							size="sm"
							onclick={() => (topFoodsDays = 30)}
						>
							{m.insights_30d()}
						</Button>
					</div>
				</div>

				{#if topFoodsLoading}
					<div class="flex justify-center py-8">
						<div
							class="border-muted-foreground/30 border-t-muted-foreground h-6 w-6 animate-spin rounded-full border-2"
						></div>
					</div>
				{:else if foods.length === 0}
					<p class="text-muted-foreground py-8 text-center text-sm">{m.insights_no_data()}</p>
				{:else}
					<div class="space-y-3">
						{#each foods as food, i}
							<div class="flex items-center gap-3 rounded-lg border p-3">
								<span
									class="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
								>
									{i + 1}
								</span>
								<div class="min-w-0 flex-1">
									<div class="flex items-baseline justify-between gap-2">
										<p class="truncate text-sm font-medium">{food.foodName}</p>
										<span class="shrink-0 text-sm font-semibold tabular-nums">
											{Math.round(food.calories)} kcal
										</span>
									</div>
									<div class="mt-0.5 text-xs text-muted-foreground">
										{m.insights_times_logged({ count: food.count.toString() })} &middot; {Math.round(
											food.calories
										)}
										kcal {m.insights_per_serving()}
									</div>
									<div class="mt-1.5 flex gap-3 text-xs tabular-nums">
										<span style="color: {MACRO_COLORS.protein}">{+food.protein.toFixed(1)}g P</span>
										<span style="color: {MACRO_COLORS.carbs}">{+food.carbs.toFixed(1)}g C</span>
										<span style="color: {MACRO_COLORS.fat}">{+food.fat.toFixed(1)}g F</span>
										<span style="color: {MACRO_COLORS.fiber}">{+food.fiber.toFixed(1)}g Fi</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</CollapsibleCard>

		<div class="space-y-4 pt-2">
			<EatingWindowCard />
			<MealSpacingCard />
			<NutrientAdequacyCard />
		</div>
	{:else if activeTab === 'weight'}
		<div class="space-y-6 pb-8">
			<Card.Root
				class="overflow-hidden border-border/60 bg-linear-to-br from-blue-50/80 via-background to-emerald-50/60 dark:from-blue-950/20 dark:via-background dark:to-emerald-950/10"
			>
				<Card.Content class="relative p-4 sm:p-6">
					<div
						class="absolute -top-14 -right-10 h-36 w-36 rounded-full bg-blue-500/10 blur-2xl"
					></div>
					<div
						class="absolute -bottom-16 left-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl"
					></div>
					<div class="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div class="grid grid-cols-2 gap-2 sm:min-w-[360px] sm:gap-3">
							<div class="rounded-xl border border-border/60 bg-background/85 p-3 backdrop-blur">
								<div
									class="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-wider"
								>
									{m.weight_actual()}
								</div>
								<div class="text-sm font-semibold tabular-nums sm:text-base">
									{formatKg(latestEntry?.weightKg ?? null)}
								</div>
							</div>
							<div class="rounded-xl border border-border/60 bg-background/85 p-3 backdrop-blur">
								<div
									class="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-wider"
								>
									{m.weight_trend()}
								</div>
								<div class="text-sm font-semibold tabular-nums sm:text-base">
									{formatKg(latestTrend)}
								</div>
							</div>
							<div class="rounded-xl border border-border/60 bg-background/85 p-3 backdrop-blur">
								<div
									class="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-wider"
								>
									{m.weight_history()}
								</div>
								<div class="text-sm font-semibold tabular-nums sm:text-base">
									{entries.length}
								</div>
							</div>
							<div class="rounded-xl border border-border/60 bg-background/85 p-3 backdrop-blur">
								<div
									class="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-wider"
								>
									{m.weight_chart()}
								</div>
								<div class="text-sm font-semibold tabular-nums sm:text-base">
									{weightChartData.length}
								</div>
							</div>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root class="overflow-hidden">
				<Card.Header class="pb-3">
					<div class="flex items-center gap-2">
						<div
							class="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"
						>
							<Weight class="size-4" />
						</div>
						<Card.Title class="text-base tracking-tight">{m.weight_log()}</Card.Title>
					</div>
				</Card.Header>
				<Card.Content class="p-4 pt-0 sm:p-5 sm:pt-0">
					<WeightLogForm onLogged={() => loadWeightChart()} />
				</Card.Content>
			</Card.Root>

			{#if weightLoading}
				<div class="space-y-4">
					<Card.Root>
						<Card.Content class="p-3 sm:p-4">
							<div class="bg-muted/50 h-[360px] animate-pulse rounded-xl"></div>
						</Card.Content>
					</Card.Root>
					<Card.Root>
						<Card.Content class="p-4">
							<div class="bg-muted/50 h-[220px] animate-pulse rounded-xl"></div>
						</Card.Content>
					</Card.Root>
				</div>
			{:else}
				<Card.Root class="overflow-hidden">
					<Card.Content class="p-3 sm:p-4">
						<WeightChart data={weightChartData} onRangeChange={handleRangeChange} />
					</Card.Content>
				</Card.Root>

				<Card.Root class="overflow-hidden">
					<Card.Header class="flex flex-row items-center justify-between gap-2 pb-3">
						<div class="flex items-center gap-2">
							<div
								class="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
							>
								<History class="size-4" />
							</div>
							<Card.Title class="text-base">{m.weight_history()}</Card.Title>
						</div>
						<div
							class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground"
						>
							<Weight class="size-3.5" />
							{entries.length}
						</div>
					</Card.Header>
					<Card.Content class="pt-0">
						<WeightHistoryList {entries} onChanged={() => loadWeightChart()} limit={7} />
						{#if entries.length > 7}
							<div class="mt-3 flex justify-end border-t pt-3">
								<Button variant="ghost" size="sm" href="/weight" class="gap-1.5">
									{m.weight_view_all({ count: String(entries.length) })}
									<ArrowRight class="size-3.5" />
								</Button>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}

			<div class="space-y-4">
				<CaloricLagCard />
				<MacroImpactCard />
				<MealTimingWeightCard />
				<MicronutrientGapsCard />
			</div>
		</div>
	{:else if activeTab === 'sleep'}
		<SleepTabContent />
	{/if}
</div>
