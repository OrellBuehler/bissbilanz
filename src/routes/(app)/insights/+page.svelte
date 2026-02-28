<script lang="ts">
	import { PieChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { today, shiftDate } from '$lib/utils/dates';
	import { onMount } from 'svelte';
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
	let data: MealData[] = $state([]);
	let mealLoading = $state(true);

	let topFoodsDays = $state(7);
	let foods: TopFood[] = $state([]);
	let topFoodsLoading = $state(true);

	const MEAL_COLORS: Record<string, string> = {
		Breakfast: '#F59E0B',
		Lunch: '#3B82F6',
		Dinner: '#8B5CF6',
		Snacks: '#10B981'
	};

	const DEFAULT_COLOR = '#6B7280';
	const getMealColor = (mealType: string) => MEAL_COLORS[mealType] ?? DEFAULT_COLOR;

	const fetchData = async (r: Range) => {
		mealLoading = true;
		try {
			const todayStr = today();
			let url: string;
			if (r === 'today') {
				url = `/api/stats/meal-breakdown?date=${todayStr}`;
			} else {
				const days = r === '7d' ? 6 : 29;
				const startDate = shiftDate(todayStr, -days);
				url = `/api/stats/meal-breakdown?startDate=${startDate}&endDate=${todayStr}`;
			}
			const res = await fetch(url);
			if (res.ok) {
				const json = await res.json();
				data = json.data;
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
			const res = await apiFetch(`/api/stats/top-foods?days=${topFoodsDays}&limit=10`);
			if (res.ok) {
				const json = await res.json();
				foods = json.data;
			}
		} catch {
			// silently ignore
		} finally {
			topFoodsLoading = false;
		}
	};

	$effect(() => {
		fetchData(range);
	});

	$effect(() => {
		topFoodsDays;
		loadTopFoods();
	});

	onMount(() => {
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
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<h2 class="text-2xl font-semibold">{m.insights_title()}</h2>

	<Card.Root>
		<Card.Header>
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<Card.Title>{m.insights_meal_distribution()}</Card.Title>
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
		</Card.Header>
		<Card.Content>
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
						<!-- Mobile: card layout -->
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
										<span style="color: #EF4444">{Math.round(row.protein)}g P</span>
										<span style="color: #F97316">{Math.round(row.carbs)}g C</span>
										<span style="color: #EAB308">{Math.round(row.fat)}g F</span>
										<span style="color: #22C55E">{Math.round(row.fiber)}g Fi</span>
									</div>
								</div>
							{/each}
						</div>
						<!-- Desktop: table layout -->
						<div class="hidden sm:block">
							<table class="w-full text-sm">
								<thead>
									<tr class="text-muted-foreground border-b text-left">
										<th class="pb-2 font-medium">Meal</th>
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
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<Card.Title>{m.insights_top_foods()}</Card.Title>
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
		</Card.Header>
		<Card.Content>
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
										{food.calories} kcal
									</span>
								</div>
								<div class="mt-0.5 text-xs text-muted-foreground">
									{m.insights_times_logged({ count: food.count.toString() })} &middot; {food.calories}
									kcal {m.insights_per_serving()}
								</div>
								<div class="mt-1.5 flex gap-3 text-xs tabular-nums">
									<span style="color: #EF4444">{food.protein}g P</span>
									<span style="color: #F97316">{food.carbs}g C</span>
									<span style="color: #EAB308">{food.fat}g F</span>
									<span style="color: #22C55E">{food.fiber}g Fi</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
