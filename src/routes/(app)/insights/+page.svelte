<script lang="ts">
	import { PieChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { today, shiftDate } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';

	type MealData = {
		mealType: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	};

	type Range = 'today' | '7d' | '30d';
	let range: Range = $state('today');
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

	const fetchData = async (r: Range) => {
		loading = true;
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
			loading = false;
		}
	};

	$effect(() => {
		fetchData(range);
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
			<div class="flex items-center justify-between">
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
			{#if loading}
				<div class="text-muted-foreground flex h-[300px] items-center justify-center text-sm">
					{m.add_food_loading()}
				</div>
			{:else if hasData}
				<div class="flex flex-col gap-6 md:flex-row md:items-start">
					<div class="h-[300px] w-full md:w-1/2">
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
						<div class="overflow-x-auto">
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
				<div class="text-muted-foreground flex h-[300px] items-center justify-center text-sm">
					{m.insights_no_data()}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
