<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import { weightService } from '$lib/services/weight-service.svelte';
	import { today } from '$lib/utils/dates';
	import { formatKg } from '$lib/utils/number';
	import { toast } from 'svelte-sonner';
	import Weight from '@lucide/svelte/icons/weight';
	import * as m from '$lib/paraglide/messages';

	let {
		weightKg = null,
		entryDate = null
	}: {
		weightKg: number | null;
		entryDate: string | null;
	} = $props();

	let inputValue = $state<number | null>(null);
	let saving = $state(false);

	const isToday = $derived(entryDate === today());

	const logWeight = async (e: Event) => {
		e.preventDefault();
		const kg = inputValue;
		if (kg == null || kg <= 0) return;
		saving = true;
		try {
			await weightService.create({ weightKg: kg, entryDate: today() });
			inputValue = null;
		} catch {
			toast.error('Failed to log weight');
		} finally {
			saving = false;
		}
	};
</script>

<DashboardCard title={m.dashboard_weight()} Icon={Weight} tone="primary">
	{#snippet headerRight()}
		{#if weightKg != null}
			<span class="text-muted-foreground text-xs sm:text-sm">{entryDate}</span>
		{/if}
	{/snippet}
	{#if weightKg != null}
		<p class="text-3xl font-bold tabular-nums">
			{m.dashboard_weight_latest({ value: formatKg(weightKg) })}
		</p>
	{:else}
		<p class="text-muted-foreground text-sm">{m.dashboard_weight_no_entries()}</p>
	{/if}
	{#if !isToday}
		<form onsubmit={logWeight} class="mt-3 flex gap-2">
			<NumberInput
				placeholder={m.dashboard_weight_placeholder()}
				bind:value={inputValue}
				class="min-w-0 h-9"
			/>
			<Button type="submit" size="sm" disabled={saving || inputValue == null}>
				{m.dashboard_weight_log()}
			</Button>
		</form>
	{/if}
	<Button variant="outline" size="sm" href="/insights?tab=weight" class="mt-3 w-full">
		{m.dashboard_weight_view_all()}
	</Button>
</DashboardCard>
