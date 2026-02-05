<script lang="ts">
	import Calendar from '$lib/components/history/Calendar.svelte';
	import MacroSummary from '$lib/components/MacroSummary.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { MacroTotals } from '$lib/utils/nutrition';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';

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
	<h1 class="text-2xl font-semibold">{m.history_title()}</h1>

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
</div>
