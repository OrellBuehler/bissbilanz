<script lang="ts">
	import { getMonthDays, getMonthName, getDayOfWeek } from '$lib/utils/dates';

	type Props = {
		year: number;
		month: number;
		dayColors?: Record<string, string>;
		onDayClick?: (date: string) => void;
		onPrevMonth?: () => void;
		onNextMonth?: () => void;
	};

	let { year, month, dayColors = {}, onDayClick, onPrevMonth, onNextMonth }: Props = $props();

	const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	const monthData = $derived(getMonthDays(year, month));
	const firstDayOffset = $derived(getDayOfWeek(monthData.days[0]));
</script>

<div class="rounded border p-4">
	<div class="mb-4 flex items-center justify-between">
		<button class="rounded border px-2 py-1" onclick={onPrevMonth}>&lt;</button>
		<span class="font-semibold">{getMonthName(month)} {year}</span>
		<button class="rounded border px-2 py-1" onclick={onNextMonth}>&gt;</button>
	</div>
	<div class="grid grid-cols-7 gap-1 text-center text-sm">
		{#each weekdays as day}
			<div class="font-medium text-neutral-500">{day}</div>
		{/each}
		{#each Array(firstDayOffset) as _}
			<div></div>
		{/each}
		{#each monthData.days as date}
			<button
				class="rounded p-2 hover:bg-neutral-100"
				style={dayColors[date] ? `background-color: ${dayColors[date]}` : ''}
				onclick={() => onDayClick?.(date)}
			>
				{new Date(date + 'T00:00:00Z').getUTCDate()}
			</button>
		{/each}
	</div>
</div>
