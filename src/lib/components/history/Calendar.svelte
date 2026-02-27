<script lang="ts">
	import { getMonthDays, getMonthName, getDayOfWeek } from '$lib/utils/dates';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as m from '$lib/paraglide/messages';

	type DayStatus = 'on-target' | 'off-target' | 'logged' | 'none';

	type Props = {
		year: number;
		month: number;
		dayColors?: Record<string, string>;
		dayStatus?: Record<string, DayStatus>;
		onDayClick?: (date: string) => void;
		onPrevMonth?: () => void;
		onNextMonth?: () => void;
	};

	let {
		year,
		month,
		dayColors = {},
		dayStatus = {},
		onDayClick,
		onPrevMonth,
		onNextMonth
	}: Props = $props();

	const statusClasses: Record<DayStatus, string> = {
		'on-target': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/15',
		'off-target': 'bg-amber-500/20 text-amber-700 dark:text-amber-300 dark:bg-amber-500/15',
		logged: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 dark:bg-blue-500/10',
		none: ''
	};

	const weekdays = $derived([
		m.calendar_sun(),
		m.calendar_mon(),
		m.calendar_tue(),
		m.calendar_wed(),
		m.calendar_thu(),
		m.calendar_fri(),
		m.calendar_sat()
	]);

	const monthData = $derived(getMonthDays(year, month));
	const firstDayOffset = $derived(getDayOfWeek(monthData.days[0]));

	const hasAnyStatus = $derived(Object.keys(dayStatus).length > 0);

	const getDayClass = (date: string) => {
		const status = dayStatus[date];
		if (status && status !== 'none') return statusClasses[status];
		return '';
	};
</script>

<Card.Root>
	<Card.Content class="p-4">
		<div class="mb-4 flex items-center justify-between">
			<Button variant="outline" size="icon" onclick={onPrevMonth}>
				<ChevronLeft class="size-4" />
			</Button>
			<span class="font-semibold">{getMonthName(month)} {year}</span>
			<Button variant="outline" size="icon" onclick={onNextMonth}>
				<ChevronRight class="size-4" />
			</Button>
		</div>
		<div class="grid grid-cols-7 gap-1 text-center text-sm">
			{#each weekdays as day}
				<div class="font-medium text-muted-foreground">{day}</div>
			{/each}
			{#each Array(firstDayOffset) as _}
				<div></div>
			{/each}
			{#each monthData.days as date}
				<Button
					variant="ghost"
					size="sm"
					class="h-8 w-full p-0 {getDayClass(date)}"
					style={dayColors[date] ? `background-color: ${dayColors[date]}` : ''}
					onclick={() => onDayClick?.(date)}
				>
					{new Date(date + 'T00:00:00Z').getUTCDate()}
				</Button>
			{/each}
		</div>
		{#if hasAnyStatus}
			<div class="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
				<div class="flex items-center gap-1.5">
					<span class="size-2 rounded-full bg-emerald-500"></span>
					{m.calendar_on_target()}
				</div>
				<div class="flex items-center gap-1.5">
					<span class="size-2 rounded-full bg-amber-500"></span>
					{m.calendar_off_target()}
				</div>
				<div class="flex items-center gap-1.5">
					<span class="size-2 rounded-full bg-blue-500"></span>
					{m.calendar_logged()}
				</div>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
