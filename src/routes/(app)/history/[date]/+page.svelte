<script lang="ts">
	import { page } from '$app/stores';
	import DayLog from '$lib/components/entries/DayLog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ScanBarcode from '@lucide/svelte/icons/scan-barcode';
	import * as m from '$lib/paraglide/messages';
	import { entryService } from '$lib/services/entry-service.svelte';
	import { mealTypeService } from '$lib/services/meal-type-service.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import type { DexieFoodEntry } from '$lib/db/types';

	const date = $derived($page.params.date ?? '');
	let scanModalOpen = $state(false);

	const entries = useLiveQuery(() => entryService.entriesByDate(date), [] as DexieFoodEntry[]);

	$effect(() => {
		if (date) {
			entryService.refresh(date).catch(() => {});
			mealTypeService.refresh();
		}
	});
</script>

<div class="mx-auto max-w-4xl space-y-6 pb-6">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => (scanModalOpen = true)}>
				<ScanBarcode class="size-4" />
				{m.dashboard_scan()}
			</Button>
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
