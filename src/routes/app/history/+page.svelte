<script lang="ts">
	import Calendar from '$lib/components/history/Calendar.svelte';
	import MacroSummary from '$lib/components/MacroSummary.svelte';
	import type { MacroTotals } from '$lib/utils/nutrition';
	import { goto } from '$app/navigation';

	const now = new Date();
	let year = $state(now.getFullYear());
	let month = $state(now.getMonth());
	let weeklyStats: MacroTotals | null = $state(null);
	let monthlyStats: MacroTotals | null = $state(null);

	const loadStats = async () => {
		const [weeklyRes, monthlyRes] = await Promise.all([
			fetch('/api/stats/weekly'),
			fetch('/api/stats/monthly')
		]);
		weeklyStats = (await weeklyRes.json()).stats;
		monthlyStats = (await monthlyRes.json()).stats;
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

	loadStats();
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">History</h1>

	<div class="grid gap-6 md:grid-cols-2">
		<div>
			<Calendar {year} {month} onDayClick={goToDay} onPrevMonth={prevMonth} onNextMonth={nextMonth} />
		</div>

		<div class="space-y-4">
			<div class="rounded border p-4">
				<h3 class="mb-2 font-semibold">Weekly Average (7 days)</h3>
				{#if weeklyStats}
					<MacroSummary totals={weeklyStats} round />
				{:else}
					<p class="text-neutral-500">Loading...</p>
				{/if}
			</div>

			<div class="rounded border p-4">
				<h3 class="mb-2 font-semibold">Monthly Average (30 days)</h3>
				{#if monthlyStats}
					<MacroSummary totals={monthlyStats} round />
				{:else}
					<p class="text-neutral-500">Loading...</p>
				{/if}
			</div>
		</div>
	</div>
</div>
