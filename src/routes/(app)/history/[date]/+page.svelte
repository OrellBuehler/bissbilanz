<script lang="ts">
	import { page } from '$app/stores';
	import DayLog from '$lib/components/entries/DayLog.svelte';
	import * as m from '$lib/paraglide/messages';

	const date = $derived($page.params.date ?? '');
</script>

<div class="mx-auto max-w-4xl space-y-6 pb-6">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<h2 class="text-2xl font-semibold">{date}</h2>
		<a href="/history" class="inline-flex w-full items-center justify-center rounded border px-3 py-2 text-sm sm:w-auto">
			{m.history_back()}
		</a>
	</div>

	<DayLog {date} />
</div>
