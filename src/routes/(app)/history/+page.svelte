<script lang="ts">
	import { onMount } from 'svelte';
	import Calendar from '$lib/components/history/Calendar.svelte';
	import CalorieTrendChart from '$lib/components/charts/CalorieTrendChart.svelte';
	import MacroBreakdownChart from '$lib/components/charts/MacroBreakdownChart.svelte';
	import ChartRangeSelector from '$lib/components/charts/ChartRangeSelector.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { MacroTotals } from '$lib/utils/nutrition';
	import { today, daysAgo } from '$lib/utils/dates';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';

	const now = new Date();
	let year = $state(now.getFullYear());
	let month = $state(now.getMonth());
	let weeklyStats: MacroTotals | null = $state(null);
	let monthlyStats: MacroTotals | null = $state(null);
	let chartData: Array<{ date: string } & MacroTotals> = $state([]);
	let calorieGoal: number | undefined = $state(undefined);
	let chartLoading = $state(false);

	const loadStats = async () => {
		const [weeklyRes, monthlyRes] = await Promise.all([
			fetch('/api/stats/weekly'),
			fetch('/api/stats/monthly')
		]);
		weeklyStats = (await weeklyRes.json()).stats;
		monthlyStats = (await monthlyRes.json()).stats;
	};

	const loadChartData = async (startDate: string, endDate: string) => {
		chartLoading = true;
		try {
			const res = await fetch(
				`/api/stats/daily?startDate=${startDate}&endDate=${endDate}`
			);
			if (!res.ok) return;
			const json = await res.json();
			chartData = json.data ?? [];
			calorieGoal = json.goals?.calorieGoal ?? undefined;
		} finally {
			chartLoading = false;
		}
	};

	const handleRangeChange = (start: string, end: string) => {
		loadChartData(start, end);
	};

	const prevMonth = () => {
		if (month === 0) { month = 11; year--; } else { month--; }
	};

	const nextMonth = () => {
		if (month === 11) { month = 0; year++; } else { month++; }
	};

	const goToDay = (date: string) => {
		goto(`/history/${date}`);
	};

	const fmt = (n: number) => Math.round(n).toLocaleString();

	onMount(() => {
		loadStats();
		loadChartData(daysAgo(7), today());
	});
</script>

<div class="mx-auto max-w-4xl space-y-6 pb-8">
	<!-- Calendar & Averages -->
	<div class="grid gap-6 md:grid-cols-2">
		<Calendar {year} {month} onDayClick={goToDay} onPrevMonth={prevMonth} onNextMonth={nextMonth} />

		<div class="grid grid-cols-1 gap-4">
			<!-- Weekly Average -->
			<Card.Root class="overflow-hidden">
				<Card.Content class="p-5">
					<p class="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">{m.history_weekly()}</p>
					{#if weeklyStats}
						<div class="mb-4 flex items-baseline gap-1.5">
							<span class="text-3xl font-bold tabular-nums tracking-tight">{fmt(weeklyStats.calories)}</span>
							<span class="text-muted-foreground text-sm font-medium">kcal</span>
						</div>
						<div class="grid grid-cols-4 gap-3">
							<div>
								<div class="mb-0.5 text-[11px] font-medium text-red-500">{m.macro_protein()}</div>
								<div class="text-sm font-semibold tabular-nums">{fmt(weeklyStats.protein)}g</div>
							</div>
							<div>
								<div class="mb-0.5 text-[11px] font-medium text-orange-500">{m.macro_carbs()}</div>
								<div class="text-sm font-semibold tabular-nums">{fmt(weeklyStats.carbs)}g</div>
							</div>
							<div>
								<div class="mb-0.5 text-[11px] font-medium text-yellow-500">{m.macro_fat()}</div>
								<div class="text-sm font-semibold tabular-nums">{fmt(weeklyStats.fat)}g</div>
							</div>
							<div>
								<div class="mb-0.5 text-[11px] font-medium text-green-500">{m.macro_fiber()}</div>
								<div class="text-sm font-semibold tabular-nums">{fmt(weeklyStats.fiber)}g</div>
							</div>
						</div>
					{:else}
						<div class="bg-muted/50 h-20 animate-pulse rounded-lg"></div>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Monthly Average -->
			<Card.Root class="overflow-hidden">
				<Card.Content class="p-5">
					<p class="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">{m.history_monthly()}</p>
					{#if monthlyStats}
						<div class="mb-4 flex items-baseline gap-1.5">
							<span class="text-3xl font-bold tabular-nums tracking-tight">{fmt(monthlyStats.calories)}</span>
							<span class="text-muted-foreground text-sm font-medium">kcal</span>
						</div>
						<div class="grid grid-cols-4 gap-3">
							<div>
								<div class="mb-0.5 text-[11px] font-medium text-red-500">{m.macro_protein()}</div>
								<div class="text-sm font-semibold tabular-nums">{fmt(monthlyStats.protein)}g</div>
							</div>
							<div>
								<div class="mb-0.5 text-[11px] font-medium text-orange-500">{m.macro_carbs()}</div>
								<div class="text-sm font-semibold tabular-nums">{fmt(monthlyStats.carbs)}g</div>
							</div>
							<div>
								<div class="mb-0.5 text-[11px] font-medium text-yellow-500">{m.macro_fat()}</div>
								<div class="text-sm font-semibold tabular-nums">{fmt(monthlyStats.fat)}g</div>
							</div>
							<div>
								<div class="mb-0.5 text-[11px] font-medium text-green-500">{m.macro_fiber()}</div>
								<div class="text-sm font-semibold tabular-nums">{fmt(monthlyStats.fiber)}g</div>
							</div>
						</div>
					{:else}
						<div class="bg-muted/50 h-20 animate-pulse rounded-lg"></div>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>

	<!-- Range Selector -->
	<ChartRangeSelector onRangeChange={handleRangeChange} />

	<!-- Charts -->
	{#if chartLoading}
		<div class="space-y-6">
			<Card.Root>
				<Card.Content class="p-5">
					<div class="bg-muted/50 h-[280px] animate-pulse rounded-xl"></div>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="p-5">
					<div class="bg-muted/50 h-[280px] animate-pulse rounded-xl"></div>
				</Card.Content>
			</Card.Root>
		</div>
	{:else if chartData.length > 0}
		<Card.Root>
			<Card.Content class="p-5">
				<p class="text-muted-foreground mb-4 text-xs font-semibold uppercase tracking-wider">{m.charts_calories_trend()}</p>
				<div class="h-[280px]">
					<CalorieTrendChart data={chartData} {calorieGoal} />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Content class="p-5">
				<p class="text-muted-foreground mb-4 text-xs font-semibold uppercase tracking-wider">{m.charts_macro_breakdown()}</p>
				<div class="h-[280px]">
					<MacroBreakdownChart data={chartData} />
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
