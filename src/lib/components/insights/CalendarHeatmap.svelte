<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { goto } from '$app/navigation';
	import { statsService } from '$lib/services/stats-service.svelte';
	import { goalsService } from '$lib/services/goals-service.svelte';
	import { getMonthName } from '$lib/utils/dates';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import * as m from '$lib/paraglide/messages';

	type CalendarDay = { calories: number; hasEntries: boolean };

	let currentYear = $state(new Date().getFullYear());
	let currentMonth = $state(new Date().getMonth());
	let days: Record<string, CalendarDay> = $state({});
	let loading = $state(true);

	const goalsQuery = useLiveQuery(() => goalsService.goals(), undefined);
	const calorieGoal = $derived(goalsQuery.value?.calorieGoal ?? 0);

	const monthStr = $derived(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`);

	const fetchData = async (ms: string) => {
		loading = true;
		try {
			const result = await statsService.getCalendarStats(ms);
			if (result) {
				days = result.days;
			} else {
				days = {};
			}
		} catch {
			days = {};
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		fetchData(monthStr);
	});

	function prevMonth() {
		if (currentMonth === 0) {
			currentMonth = 11;
			currentYear--;
		} else {
			currentMonth--;
		}
	}

	function nextMonth() {
		if (currentMonth === 11) {
			currentMonth = 0;
			currentYear++;
		} else {
			currentMonth++;
		}
	}

	const firstDayOfMonth = $derived(new Date(currentYear, currentMonth, 1));
	const daysInMonth = $derived(new Date(currentYear, currentMonth + 1, 0).getDate());
	const startDow = $derived.by(() => {
		const dow = firstDayOfMonth.getDay();
		return dow === 0 ? 6 : dow - 1;
	});

	const calendarCells = $derived.by(() => {
		const cells: Array<{ date: string | null; day: number | null }> = [];
		for (let i = 0; i < startDow; i++) {
			cells.push({ date: null, day: null });
		}
		for (let d = 1; d <= daysInMonth; d++) {
			const date = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			cells.push({ date, day: d });
		}
		return cells;
	});

	function cellColor(date: string | null): string {
		if (!date || !days[date]) return 'bg-muted/30';
		const entry = days[date];
		if (!entry.hasEntries) return 'bg-muted/30';
		if (!calorieGoal) return 'bg-blue-500/30';

		const ratio = entry.calories / calorieGoal;
		if (ratio >= 0.9 && ratio <= 1.1) return 'bg-green-500/60';
		if (ratio > 1.1) {
			return ratio > 1.3 ? 'bg-red-500/70' : 'bg-red-500/40';
		}
		return ratio < 0.7 ? 'bg-blue-500/70' : 'bg-blue-500/40';
	}

	function cellTitle(date: string | null): string {
		if (!date || !days[date]) return m.insights_no_entries();
		return `${days[date].calories} kcal`;
	}

	const dayHeaders = [
		() => m.calendar_mon(),
		() => m.calendar_tue(),
		() => m.calendar_wed(),
		() => m.calendar_thu(),
		() => m.calendar_fri(),
		() => m.calendar_sat(),
		() => m.calendar_sun()
	];
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<Button variant="ghost" size="icon" onclick={prevMonth}>
			<ChevronLeft class="size-4" />
		</Button>
		<span class="text-sm font-medium">{getMonthName(currentMonth)} {currentYear}</span>
		<Button variant="ghost" size="icon" onclick={nextMonth}>
			<ChevronRight class="size-4" />
		</Button>
	</div>

	{#if loading}
		<div class="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
			{m.add_food_loading()}
		</div>
	{:else}
		<div class="grid grid-cols-7 gap-1">
			{#each dayHeaders as header}
				<div class="text-muted-foreground text-center text-xs font-medium">{header()}</div>
			{/each}

			{#each calendarCells as cell}
				{#if cell.date}
					<button
						class="flex aspect-square items-center justify-center rounded-md text-xs tabular-nums transition-colors {cellColor(
							cell.date
						)}"
						title={cellTitle(cell.date)}
						onclick={() => goto(`/?date=${cell.date}`)}
					>
						{cell.day}
					</button>
				{:else}
					<div></div>
				{/if}
			{/each}
		</div>

		<div class="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
			<div class="flex items-center gap-1">
				<div class="h-3 w-3 rounded bg-green-500/60"></div>
				<span>{m.insights_on_target()}</span>
			</div>
			<div class="flex items-center gap-1">
				<div class="h-3 w-3 rounded bg-red-500/40"></div>
				<span>{m.insights_over()}</span>
			</div>
			<div class="flex items-center gap-1">
				<div class="h-3 w-3 rounded bg-blue-500/40"></div>
				<span>{m.insights_under()}</span>
			</div>
			<div class="flex items-center gap-1">
				<div class="h-3 w-3 rounded bg-muted/30"></div>
				<span>{m.insights_no_entries()}</span>
			</div>
		</div>
	{/if}
</div>
