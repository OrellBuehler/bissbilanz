<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Weight from '@lucide/svelte/icons/weight';
	import * as m from '$lib/paraglide/messages';

	let {
		weightKg = null,
		entryDate = null
	}: {
		weightKg: number | null;
		entryDate: string | null;
	} = $props();
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between pb-2">
		<div class="flex items-center gap-2">
			<Weight class="h-5 w-5" />
			<Card.Title class="text-base">{m.dashboard_weight()}</Card.Title>
		</div>
		{#if weightKg != null}
			<span class="text-muted-foreground text-sm">{entryDate}</span>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if weightKg != null}
			<p class="text-2xl font-semibold">{m.dashboard_weight_latest({ value: weightKg.toFixed(1) })}</p>
		{:else}
			<p class="text-muted-foreground text-sm">{m.dashboard_weight_no_entries()}</p>
			<Button variant="link" href="/weight" class="h-auto p-0 text-sm">
				{m.dashboard_weight_log_first()}
			</Button>
		{/if}
		<div class="mt-3 border-t pt-3">
			<Button variant="ghost" size="sm" href="/weight" class="w-full">
				{m.dashboard_weight_view_all()}
			</Button>
		</div>
	</Card.Content>
</Card.Root>
