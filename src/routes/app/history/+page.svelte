<script lang="ts">
	import { onMount } from 'svelte';
	import Calendar from '$lib/components/history/Calendar.svelte';
	import MacroSummary from '$lib/components/MacroSummary.svelte';
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
		if (month === 0) {
			month = 11;
			year--;
		} else {
			month--;
		}
	};

	const nextMonth = () => {
		if (month === 11) {
			month = 0;
			year++;
		} else {
			month++;
		}
	};

	const goToDay = (date: string) => {
		goto(`/app/history/${date}`);
	};

	onMount(() => {
		loadStats();
		loadChartData(daysAgo(7), today());
	});
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<div class="grid gap-6 md:grid-cols-2">
		<div>
			<Calendar {year} {month} onDayClick={goToDay} onPrevMonth={prevMonth} onNextMonth={nextMonth} />
		</div>

		<div class="space-y-4">
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-base">{m.history_weekly()}</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if weeklyStats}
						<MacroSummary totals={weeklyStats} round />
					{:else}
						<p class="text-muted-foreground">{m.history_loading()}</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-base">{m.history_monthly()}</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if monthlyStats}
						<MacroSummary totals={monthlyStats} round />
					{:else}
						<p class="text-muted-foreground">{m.history_loading()}</p>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>

	<ChartRangeSelector onRangeChange={handleRangeChange} />

	{#if chartLoading}
		<div class="space-y-6">
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-base">{m.charts_calories_trend()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="bg-muted/50 h-[300px] animate-pulse rounded"></div>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-base">{m.charts_macro_breakdown()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="bg-muted/50 h-[300px] animate-pulse rounded"></div>
				</Card.Content>
			</Card.Root>
		</div>
	{:else if chartData.length > 0}
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-base">{m.charts_calories_trend()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="h-[300px]">
					<CalorieTrendChart data={chartData} {calorieGoal} />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-base">{m.charts_macro_breakdown()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="h-[300px]">
					<MacroBreakdownChart data={chartData} />
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
