<script lang="ts">
	import Calendar from '$lib/components/history/Calendar.svelte';
	import { today } from '$lib/utils/dates';
	import { goto } from '$app/navigation';

	const now = new Date();
	let year = $state(now.getFullYear());
	let month = $state(now.getMonth());
	let weeklyStats: { calories: number; protein: number; carbs: number; fat: number; fiber: number } | null =
		$state(null);
	let monthlyStats: { calories: number; protein: number; carbs: number; fat: number; fiber: number } | null =
		$state(null);

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
					<div class="grid grid-cols-2 gap-2 text-sm">
						<div>Calories: {Math.round(weeklyStats.calories)}</div>
						<div>Protein: {Math.round(weeklyStats.protein)}g</div>
						<div>Carbs: {Math.round(weeklyStats.carbs)}g</div>
						<div>Fat: {Math.round(weeklyStats.fat)}g</div>
						<div>Fiber: {Math.round(weeklyStats.fiber)}g</div>
					</div>
				{:else}
					<p class="text-neutral-500">Loading...</p>
				{/if}
			</div>

			<div class="rounded border p-4">
				<h3 class="mb-2 font-semibold">Monthly Average (30 days)</h3>
				{#if monthlyStats}
					<div class="grid grid-cols-2 gap-2 text-sm">
						<div>Calories: {Math.round(monthlyStats.calories)}</div>
						<div>Protein: {Math.round(monthlyStats.protein)}g</div>
						<div>Carbs: {Math.round(monthlyStats.carbs)}g</div>
						<div>Fat: {Math.round(monthlyStats.fat)}g</div>
						<div>Fiber: {Math.round(monthlyStats.fiber)}g</div>
					</div>
				{:else}
					<p class="text-neutral-500">Loading...</p>
				{/if}
			</div>
		</div>
	</div>
</div>
