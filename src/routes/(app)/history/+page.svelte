<script lang="ts">
	import { onMount } from 'svelte';
	import Calendar from '$lib/components/history/Calendar.svelte';
	import CalorieTrendChart from '$lib/components/charts/CalorieTrendChart.svelte';
	import MacroBreakdownChart from '$lib/components/charts/MacroBreakdownChart.svelte';
	import ChartRangeSelector from '$lib/components/charts/ChartRangeSelector.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import Flame from '@lucide/svelte/icons/flame';
	import BarChart3 from '@lucide/svelte/icons/bar-chart-3';
	import Target from '@lucide/svelte/icons/target';
	import type { MacroTotals } from '$lib/utils/nutrition';
	import { today, daysAgo } from '$lib/utils/dates';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';

	type MacroKey = 'protein' | 'carbs' | 'fat' | 'fiber';

	const now = new Date();
	let year = $state(now.getFullYear());
	let month = $state(now.getMonth());
	let weeklyStats: MacroTotals | null = $state(null);
	let monthlyStats: MacroTotals | null = $state(null);
	let chartData: Array<{ date: string } & MacroTotals> = $state([]);
	let calorieGoal: number | undefined = $state(undefined);
	let chartLoading = $state(false);
	let macroVisibility = $state<Record<MacroKey, boolean>>({
		protein: true,
		carbs: true,
		fat: true,
		fiber: true
	});

	const macroLegendItems = [
		{ key: 'protein', label: () => m.macro_protein(), dotClass: 'bg-red-500' },
		{ key: 'carbs', label: () => m.macro_carbs(), dotClass: 'bg-orange-500' },
		{ key: 'fat', label: () => m.macro_fat(), dotClass: 'bg-yellow-500' },
		{ key: 'fiber', label: () => m.macro_fiber(), dotClass: 'bg-green-500' }
	] as const satisfies Array<{ key: MacroKey; label: () => string; dotClass: string }>;

	const visibleMacroKeys = $derived(
		(Object.keys(macroVisibility) as MacroKey[]).filter((key) => macroVisibility[key])
	);

	const toggleMacro = (key: MacroKey) => {
		macroVisibility[key] = !macroVisibility[key];
	};

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
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
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
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
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
				<Card.Content class="px-3 py-3 sm:px-4 sm:py-3.5">
					<div class="bg-muted/50 h-[248px] animate-pulse rounded-xl"></div>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="px-3 py-3 sm:px-4 sm:py-3.5">
					<div class="bg-muted/50 h-[248px] animate-pulse rounded-xl"></div>
				</Card.Content>
			</Card.Root>
		</div>
	{:else if chartData.length > 0}
		<Card.Root>
			<Card.Content class="px-3 py-3 sm:px-4 sm:py-3.5">
				<div class="mb-2.5 flex items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<div class="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
							<Flame class="size-4" />
						</div>
						<p class="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{m.charts_calories_trend()}</p>
					</div>
					{#if calorieGoal}
						<div class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
							<Target class="size-3.5" />
							<span>{Math.round(calorieGoal)} {m.foods_kcal()}</span>
						</div>
					{/if}
				</div>
				<div class="rounded-xl border border-blue-200/50 bg-gradient-to-b from-blue-50/70 via-blue-50/20 to-background py-2 pr-2 pl-3 dark:border-blue-900/40 dark:from-blue-950/25 dark:via-blue-950/10">
					<div class="h-[228px] sm:h-[236px]">
						<CalorieTrendChart data={chartData} {calorieGoal} />
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Content class="px-3 py-3 sm:px-4 sm:py-3.5">
				<div class="mb-2.5 flex flex-wrap items-start justify-between gap-2">
					<div class="flex items-center gap-2">
						<div class="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
							<BarChart3 class="size-4" />
						</div>
						<p class="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{m.charts_macro_breakdown()}</p>
					</div>
					<div class="flex flex-wrap items-center justify-end gap-1.5">
						{#each macroLegendItems as item (item.key)}
							<button
								type="button"
								aria-pressed={macroVisibility[item.key]}
								class={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors ${
									macroVisibility[item.key]
										? 'border-border/60 bg-background/80 text-muted-foreground'
										: 'border-border/40 bg-muted/40 text-muted-foreground/60'
								}`}
								onclick={() => toggleMacro(item.key)}
							>
								<span class={`size-1.5 rounded-full ${item.dotClass} ${macroVisibility[item.key] ? '' : 'opacity-35'}`}></span>
								{item.label()}
							</button>
						{/each}
					</div>
				</div>
				<div class="rounded-xl border border-emerald-200/50 bg-gradient-to-b from-emerald-50/60 via-emerald-50/10 to-background py-2 pr-2 pl-3 dark:border-emerald-900/40 dark:from-emerald-950/20 dark:via-emerald-950/5">
					<div class="h-[228px] sm:h-[236px]">
						<MacroBreakdownChart data={chartData} visibleKeys={visibleMacroKeys} />
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
