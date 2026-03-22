<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import WeightHistoryList from '$lib/components/weight/WeightHistoryList.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Weight from '@lucide/svelte/icons/weight';
	import { weightService } from '$lib/services/weight-service.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { DexieWeightEntry } from '$lib/db/types';

	const live = useLiveQuery(() => weightService.entries(), [] as DexieWeightEntry[]);
	const entries = $derived(live.value);

	$effect(() => {
		weightService.refresh();
	});
</script>

<svelte:head>
	<title>{m.weight_history_page_title()}</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-4">
	<div class="flex items-center gap-3">
		<Button variant="ghost" size="icon" href="/insights?tab=weight">
			<ArrowLeft class="size-4" />
		</Button>
		<h1 class="text-lg font-semibold tracking-tight">{m.weight_history_page_title()}</h1>
		<div
			class="ml-auto inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground"
		>
			<Weight class="size-3.5" />
			{entries.length}
		</div>
	</div>

	<Card.Root class="overflow-hidden">
		<Card.Content class="p-4 pt-4">
			<WeightHistoryList {entries} />
		</Card.Content>
	</Card.Root>
</div>
