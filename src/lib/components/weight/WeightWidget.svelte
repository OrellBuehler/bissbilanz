<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
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

<DashboardCard title={m.dashboard_weight()} Icon={Weight} tone="amber">
	{#snippet headerRight()}
		{#if weightKg != null}
			<span class="text-muted-foreground text-xs sm:text-sm">{entryDate}</span>
		{/if}
	{/snippet}
	{#if weightKg != null}
		<p class="text-2xl font-semibold">
			{m.dashboard_weight_latest({ value: weightKg.toFixed(1) })}
		</p>
	{:else}
		<p class="text-muted-foreground text-sm">{m.dashboard_weight_no_entries()}</p>
		<Button variant="link" href="/weight" class="h-auto p-0 text-sm">
			{m.dashboard_weight_log_first()}
		</Button>
	{/if}
	<Button variant="outline" size="sm" href="/weight" class="mt-3 w-full">
		{m.dashboard_weight_view_all()}
	</Button>
</DashboardCard>
