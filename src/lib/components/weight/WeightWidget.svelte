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
	<div
		class="rounded-xl border border-amber-200/50 bg-amber-50/25 p-3 dark:border-amber-900/30 dark:bg-amber-950/10"
	>
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
		<div class="mt-3 border-t border-amber-200/50 pt-3 dark:border-amber-900/30">
			<Button variant="ghost" size="sm" href="/weight" class="w-full">
				{m.dashboard_weight_view_all()}
			</Button>
		</div>
	</div>
</DashboardCard>
