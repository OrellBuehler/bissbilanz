<script lang="ts">
	import { onMount } from 'svelte';
	import { today, daysAgo } from '$lib/utils/dates';
	import WeightLogForm from '$lib/components/weight/WeightLogForm.svelte';
	import WeightChart from '$lib/components/weight/WeightChart.svelte';
	import WeightHistoryList from '$lib/components/weight/WeightHistoryList.svelte';
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

	const loadEntries = async () => {
		const res = await fetch('/api/weight');
		if (res.ok) {
			const data = await res.json();
			entries = data.entries;
		}
	};

	const loadChart = async () => {
		const res = await fetch(`/api/weight?from=${chartFrom}&to=${chartTo}`);
		if (res.ok) {
			const data = await res.json();
			chartData = data.data;
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

<div class="mx-auto max-w-2xl space-y-6">
	<h1 class="text-2xl font-bold">{m.weight_page_title()}</h1>

	<WeightLogForm onLogged={refreshAll} />

	{#if loading}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.add_food_loading()}</p>
	{:else}
		<WeightChart data={chartData} onRangeChange={handleRangeChange} />

		<div>
			<h2 class="mb-2 text-lg font-semibold">{m.weight_history()}</h2>
			<WeightHistoryList {entries} onChanged={refreshAll} />
		</div>
	{/if}
</div>
