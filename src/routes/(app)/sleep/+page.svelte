<script lang="ts">
	import Moon from '@lucide/svelte/icons/moon';
	import SleepStatsHeader from '$lib/components/sleep/SleepStatsHeader.svelte';
	import SleepTabContent from '$lib/components/sleep/SleepTabContent.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { sleepService } from '$lib/services/sleep-service.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { DexieSleepEntry } from '$lib/db/types';

	const live = useLiveQuery(() => sleepService.entries(), [] as DexieSleepEntry[]);
	const entries = $derived(live.value);
</script>

<svelte:head>
	<title>{m.sleep_page_title()}</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6 pb-8">
	<div class="flex items-center gap-3">
		<div
			class="flex size-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400"
		>
			<Moon class="size-5" />
		</div>
		<div>
			<h1 class="text-lg font-semibold tracking-tight">{m.sleep_page_title()}</h1>
			<p class="text-muted-foreground text-sm">{m.sleep_page_subtitle()}</p>
		</div>
	</div>

	{#if live.loading}
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			{#each [0, 1, 2, 3] as slot (slot)}
				<div class="bg-muted/50 h-24 animate-pulse rounded-xl"></div>
			{/each}
		</div>
	{:else}
		<SleepStatsHeader {entries} />
	{/if}

	<SleepTabContent />
</div>
