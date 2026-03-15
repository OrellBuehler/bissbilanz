<script lang="ts">
	import { onMount } from 'svelte';
	import { today, daysAgo } from '$lib/utils/dates';
	import WeightLogForm from '$lib/components/weight/WeightLogForm.svelte';
	import WeightChart from '$lib/components/weight/WeightChart.svelte';
	import WeightHistoryList from '$lib/components/weight/WeightHistoryList.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import Weight from '@lucide/svelte/icons/weight';
	import History from '@lucide/svelte/icons/history';
	import { api } from '$lib/api/client';
	import * as m from '$lib/paraglide/messages';

	type WeightEntry = {
		id: string;
		weightKg: number;
		entryDate: string;
		notes: string | null;
		loggedAt: string;
	};

	type ChartPoint = {
		entry_date: string;
		weight_kg: number;
		moving_avg: number | null;
	};

	let entries: WeightEntry[] = $state([]);
	let chartData: ChartPoint[] = $state([]);
	let loading = $state(true);

	let chartFrom = $state(daysAgo(30));
	let chartTo = $state(today());

	const latestEntry = $derived(entries[0] ?? null);
	const latestTrend = $derived(
		[...chartData].reverse().find((point) => point.moving_avg != null)?.moving_avg ?? null
	);
	const formatKg = (value: number | null) => (value == null ? '—' : `${value.toFixed(1)} kg`);

	const loadEntries = async () => {
		const { data } = await api.GET('/api/weight');
		if (data) {
			entries = data.entries;
		}
	};

	const loadChart = async () => {
		const { data } = await api.GET('/api/weight', {
			params: { query: { from: chartFrom, to: chartTo } }
		});
		if (data) {
			chartData = (data as any).data;
		}
	};

	const refreshAll = async () => {
		await Promise.all([loadEntries(), loadChart()]);
	};

	const handleRangeChange = (from: string, to: string) => {
		chartFrom = from;
		chartTo = to;
		loadChart();
	};

	onMount(async () => {
		await refreshAll();
		loading = false;
	});
</script>

<div class="mx-auto max-w-4xl space-y-6 pb-8">
	<Card.Root
		class="overflow-hidden border-border/60 bg-linear-to-br from-blue-50/80 via-background to-emerald-50/60 dark:from-blue-950/20 dark:via-background dark:to-emerald-950/10"
	>
		<Card.Content class="relative p-4 sm:p-6">
			<div class="absolute -top-14 -right-10 h-36 w-36 rounded-full bg-blue-500/10 blur-2xl"></div>
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
							{chartData.length}
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
			<WeightLogForm onLogged={refreshAll} />
		</Card.Content>
	</Card.Root>

	{#if loading}
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
				<WeightChart data={chartData} onRangeChange={handleRangeChange} />
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
				<WeightHistoryList {entries} onChanged={refreshAll} />
			</Card.Content>
		</Card.Root>
	{/if}
</div>
