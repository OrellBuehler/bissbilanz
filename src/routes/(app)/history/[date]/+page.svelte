<script lang="ts">
	import { page } from '$app/stores';
	import DayLog from '$lib/components/entries/DayLog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Calendar } from '$lib/components/ui/calendar/index.js';
	import ScanBarcode from '@lucide/svelte/icons/scan-barcode';
	import CopyPlus from '@lucide/svelte/icons/copy-plus';
	import * as Sentry from '@sentry/sveltekit';
	import { toast } from 'svelte-sonner';
	import { parseDate, type DateValue } from '@internationalized/date';
	import { shiftDate } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';
	import { entryService } from '$lib/services/entry-service.svelte';
	import { mealTypeService } from '$lib/services/meal-type-service.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import type { DexieFoodEntry } from '$lib/db/types';

	const date = $derived($page.params.date ?? '');
	let scanModalOpen = $state(false);
	let copyOpen = $state(false);
	let copying = $state(false);

	const entries = useLiveQuery(() => entryService.entriesByDate(date), [] as DexieFoodEntry[]);

	// Only days strictly before this one can be copied from — matches the
	// "copy a past day" framing shown to the user.
	const copyMaxValue = $derived(parseDate(shiftDate(date, -1)));

	$effect(() => {
		if (date) {
			entryService.refresh(date);
			mealTypeService.refresh();
		}
	});

	const copyFromDay = async (value: DateValue | undefined) => {
		if (!value) return;
		copyOpen = false;
		const fromDate = value.toString();
		copying = true;
		try {
			const copied = await entryService.copyEntries(fromDate, date);
			if (copied.length > 0) {
				toast.success(m.history_copy_day_success({ count: copied.length }));
			} else {
				toast.info(m.history_copy_day_empty());
			}
		} catch (err) {
			Sentry.captureException(err, { extra: { fromDate, toDate: date } });
			toast.error(m.history_copy_day_failed());
		} finally {
			copying = false;
		}
	};
</script>

<div class="mx-auto max-w-4xl space-y-6 pb-6">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" onclick={() => (scanModalOpen = true)}>
				<ScanBarcode class="size-4" />
				{m.dashboard_scan()}
			</Button>
			<Popover.Root bind:open={copyOpen}>
				<Popover.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" disabled={copying} {...props}>
							<CopyPlus class="size-4" />
							{m.history_copy_day_button()}
						</Button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content class="w-auto p-0" align="start">
					<Calendar type="single" maxValue={copyMaxValue} onValueChange={copyFromDay} />
				</Popover.Content>
			</Popover.Root>
			<a
				href="/history"
				class="inline-flex w-full items-center justify-center rounded border px-3 py-2 text-sm sm:w-auto"
			>
				{m.history_back()}
			</a>
		</div>
	</div>

	<DayLog {date} bind:scanModalOpen />
</div>
