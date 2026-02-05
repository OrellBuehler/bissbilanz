<script lang="ts">
	import { getMonthDays, getMonthName, getDayOfWeek } from '$lib/utils/dates';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		year: number;
		month: number;
		dayColors?: Record<string, string>;
		onDayClick?: (date: string) => void;
		onPrevMonth?: () => void;
		onNextMonth?: () => void;
	};

	let { year, month, dayColors = {}, onDayClick, onPrevMonth, onNextMonth }: Props = $props();

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
					class="h-8 w-full p-0"
					style={dayColors[date] ? `background-color: ${dayColors[date]}` : ''}
					onclick={() => onDayClick?.(date)}
				>
					{new Date(date + 'T00:00:00Z').getUTCDate()}
				</Button>
			{/each}
		</div>
	</Card.Content>
</Card.Root>
