<script lang="ts">
	import { page } from '$app/stores';
	import DayLog from '$lib/components/entries/DayLog.svelte';
	import * as m from '$lib/paraglide/messages';

	const date = $derived($page.params.date ?? '');
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<div class="flex items-center justify-between">
		<h2 class="text-2xl font-semibold">{date}</h2>
		<a href="/history" class="rounded border px-3 py-1 text-sm">{m.history_back()}</a>
	</div>

	<DayLog {date} />
</div>
