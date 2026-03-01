<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Calendar } from '$lib/components/ui/calendar/index.js';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { today, shiftDate, formatDateLabel } from '$lib/utils/dates';
	import { goto } from '$app/navigation';
	import { parseDate, type DateValue } from '@internationalized/date';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		date: string;
	};

	let { date }: Props = $props();

	let calendarOpen = $state(false);

	const isToday = $derived(date === today());

	const calendarValue = $derived(parseDate(date));

	const navigate = (isoDate: string) => {
		goto(`/?date=${isoDate}`, { replaceState: true });
	};

	const prevDay = () => navigate(shiftDate(date, -1));
	const nextDay = () => navigate(shiftDate(date, 1));
	const goToday = () => goto('/', { replaceState: true });

	const onCalendarChange = (value: DateValue | undefined) => {
		if (!value) return;
		navigate(value.toString());
		calendarOpen = false;
	};
</script>

<div class="flex min-w-0 items-center gap-1 sm:gap-2">
	<Button variant="ghost" size="icon" onclick={prevDay} aria-label={m.dashboard_previous_day()}>
		<ChevronLeft class="h-4 w-4" />
	</Button>

	<Popover.Root bind:open={calendarOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button variant="ghost" {...props} class="text-lg font-semibold sm:text-2xl">
					{formatDateLabel(date)}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-auto p-0" align="center">
			<Calendar type="single" value={calendarValue} onValueChange={onCalendarChange} />
		</Popover.Content>
	</Popover.Root>

	<Button variant="ghost" size="icon" onclick={nextDay} aria-label={m.dashboard_next_day()}>
		<ChevronRight class="h-4 w-4" />
	</Button>

	{#if !isToday}
		<Button variant="outline" size="sm" onclick={goToday}>
			{m.dashboard_go_to_today()}
		</Button>
	{/if}
</div>
