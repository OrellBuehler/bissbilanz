<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import Moon from '@lucide/svelte/icons/moon';
	import { goto } from '$app/navigation';
	import { getLocale } from '$lib/paraglide/runtime';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { sleepService } from '$lib/services/sleep-service.svelte';
	import * as m from '$lib/paraglide/messages';

	let { date }: { date: string } = $props();

	const entryQuery = useLiveQuery(() => sleepService.entryForDate(date), undefined);
	const entry = $derived(entryQuery.value ?? null);
	const loading = $derived(entryQuery.value === undefined);

	const formatted = $derived.by(() => {
		if (!entry) return null;
		const hours = Math.floor(entry.durationMinutes / 60);
		const minutes = entry.durationMinutes % 60;
		if (minutes === 0) return m.sleep_hours_exact({ hours: String(hours) });
		return m.sleep_hours({ hours: String(hours), minutes: String(minutes) });
	});

	const formatTime = (iso: string) =>
		new Date(iso).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
</script>

<DashboardCard title={m.sleep_widget_title()} Icon={Moon} tone="violet">
	{#snippet headerRight()}
		<Button variant="ghost" size="sm" href="/insights?tab=sleep" class="text-xs">
			{m.insights_see_more()}
		</Button>
	{/snippet}
	{#if loading}
		<div class="text-muted-foreground flex items-center text-sm">
			{m.add_food_loading()}
		</div>
	{:else if entry}
		<div class="flex items-baseline gap-3">
			<span class="text-3xl font-bold tabular-nums">{formatted}</span>
			<span class="text-muted-foreground text-sm">
				{m.sleep_widget_quality_label()}
				{entry.quality}/10
			</span>
		</div>
		{#if entry.bedtime || entry.wakeTime}
			<p class="text-muted-foreground mt-1 text-sm">
				{#if entry.bedtime}{formatTime(entry.bedtime)}{/if}
				{#if entry.bedtime && entry.wakeTime}
					–
				{/if}
				{#if entry.wakeTime}{formatTime(entry.wakeTime)}{/if}
			</p>
		{/if}
	{:else}
		<p class="text-muted-foreground text-sm">{m.sleep_widget_no_data()}</p>
		<Button variant="outline" size="sm" class="mt-2" onclick={() => goto('/insights?tab=sleep')}>
			{m.sleep_widget_log_prompt()}
		</Button>
	{/if}
</DashboardCard>
