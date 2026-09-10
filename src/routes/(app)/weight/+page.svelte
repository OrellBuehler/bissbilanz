<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import WeightChart from '$lib/components/weight/WeightChart.svelte';
	import WeightHistoryList from '$lib/components/weight/WeightHistoryList.svelte';
	import WeightLogForm from '$lib/components/weight/WeightLogForm.svelte';
	import WeightGoalCard from '$lib/components/weight/WeightGoalCard.svelte';
	import Weight from '@lucide/svelte/icons/weight';
	import History from '@lucide/svelte/icons/history';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import { weightService } from '$lib/services/weight-service.svelte';
	import { goalsService } from '$lib/services/goals-service.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { api } from '$lib/api/client';
	import { computeWeightStats, computeGoalProjection } from '$lib/analytics/weight-goal';
	import { formatKg } from '$lib/utils/number';
	import { today, daysAgo } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';
	import type { DexieWeightEntry } from '$lib/db/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type ChartPoint = { entry_date: string; weight_kg: number; moving_avg: number | null };

	const live = useLiveQuery(() => weightService.entries(), [] as DexieWeightEntry[]);
	const entries = $derived(live.value);
	const cachedGoals = useLiveQuery(() => goalsService.goals(), undefined);

	let chartData = $state<ChartPoint[]>(data.initialChartData as ChartPoint[]);
	let chartFrom = $state(daysAgo(30));
	let chartTo = $state(today());

	$effect(() => {
		weightService.refresh();
		goalsService.refresh();
	});

	const loadChart = async () => {
		const { data: apiData } = await api.GET('/api/weight', {
			params: { query: { from: chartFrom, to: chartTo } }
		});
		if (apiData && 'data' in apiData) chartData = apiData.data;
	};

	const handleRangeChange = (from: string, to: string) => {
		chartFrom = from;
		chartTo = to;
		loadChart();
	};

	const stats = $derived(computeWeightStats(entries));

	const target = $derived({
		targetWeightKg: cachedGoals.value?.targetWeightKg ?? data.target.targetWeightKg ?? null,
		targetDate: cachedGoals.value?.targetDate ?? data.target.targetDate ?? null
	});

	const projection = $derived(
		computeGoalProjection({
			currentWeightKg: stats.average7Kg ?? stats.latestKg,
			targetWeightKg: target.targetWeightKg,
			targetDate: target.targetDate,
			ratePerWeekKg: stats.ratePerWeekKg,
			asOf: today()
		})
	);

	const formatValue = (value: number | null) => (value == null ? '—' : `${formatKg(value)} kg`);
	const formatDelta = (value: number | null) =>
		value == null ? '—' : `${value > 0 ? '+' : ''}${formatKg(value)} kg`;
	const deltaClass = (value: number | null) =>
		value == null || Math.abs(value) < 0.05
			? 'text-foreground'
			: value > 0
				? 'text-orange-600 dark:text-orange-400'
				: 'text-emerald-600 dark:text-emerald-400';

	const summary = $derived([
		{ label: m.weight_stat_latest(), value: formatValue(stats.latestKg), tone: 'text-foreground' },
		{ label: m.weight_stat_avg7(), value: formatValue(stats.average7Kg), tone: 'text-foreground' },
		{
			label: m.weight_stat_change30(),
			value: formatDelta(stats.change30Kg),
			tone: deltaClass(stats.change30Kg)
		},
		{
			label: m.weight_stat_rate(),
			value:
				stats.ratePerWeekKg == null
					? '—'
					: `${stats.ratePerWeekKg > 0 ? '+' : ''}${stats.ratePerWeekKg.toFixed(2)} ${m.analytics_kg_per_week()}`,
			tone: deltaClass(stats.ratePerWeekKg)
		}
	]);
</script>

<svelte:head>
	<title>{m.weight_page_title()}</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-4">
	<h1 class="sr-only">{m.weight_page_title()}</h1>
	<DashboardCard title={m.weight_page_title()} Icon={Weight} tone="primary">
		{#snippet headerRight()}
			<Button variant="ghost" size="sm" href="/insights?tab=weight" class="gap-1.5"
				><ChartLine class="size-3.5" />{m.insights_tab_weight()}</Button
			>
		{/snippet}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each summary as stat}
				<div class="rounded-lg bg-muted/30 p-2">
					<p class="text-[11px] text-muted-foreground">{stat.label}</p>
					<p class="mt-0.5 text-sm font-semibold tabular-nums {stat.tone}">{stat.value}</p>
				</div>
			{/each}
		</div>
	</DashboardCard>

	<WeightGoalCard {projection} />

	<DashboardCard title={m.weight_log()} Icon={Weight} tone="primary">
		<WeightLogForm onLogged={() => loadChart()} />
	</DashboardCard>

	<Card.Root class="overflow-hidden">
		<Card.Content class="p-3 sm:p-4">
			<WeightChart data={chartData} onRangeChange={handleRangeChange} />
		</Card.Content>
	</Card.Root>

	<DashboardCard title={m.weight_history()} Icon={History} tone="primary">
		{#snippet headerRight()}
			<div
				class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground"
			>
				<Weight class="size-3.5" />
				{entries.length}
			</div>
		{/snippet}

		<WeightHistoryList {entries} onChanged={() => loadChart()} />
	</DashboardCard>
</div>
