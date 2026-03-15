<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { weightService } from '$lib/services/weight-service.svelte';
	import { today } from '$lib/utils/dates';
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

	let inputValue = $state('');
	let saving = $state(false);

	const isToday = $derived(entryDate === today());

	const logWeight = async (e: Event) => {
		e.preventDefault();
		const kg = parseFloat(inputValue.replace(',', '.'));
		if (isNaN(kg) || kg <= 0) return;
		saving = true;
		try {
			await weightService.create({ weightKg: kg, entryDate: today() });
			inputValue = '';
		} catch {
			toast.error('Failed to log weight');
		} finally {
			saving = false;
		}
	};
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
	{/if}
	{#if !isToday}
		<form onsubmit={logWeight} class="mt-3 flex gap-2">
			<Input
				type="number"
				step="0.1"
				min="0"
				placeholder={m.dashboard_weight_placeholder()}
				bind:value={inputValue}
				class="h-9"
			/>
			<Button type="submit" size="sm" disabled={saving || !inputValue}>
				{m.dashboard_weight_log()}
			</Button>
		</form>
	{/if}
	<Button variant="outline" size="sm" href="/weight" class="mt-3 w-full">
		{m.dashboard_weight_view_all()}
	</Button>
</DashboardCard>
