<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import { weightService } from '$lib/services/weight-service.svelte';
	import { round2 } from '$lib/utils/number';
	import { formatTime } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';
	import type { DexieWeightEntry } from '$lib/db/types';

	let {
		entries,
		onChanged,
		limit
	}: { entries: DexieWeightEntry[]; onChanged?: () => void; limit?: number } = $props();

	const displayed = $derived(limit != null ? entries.slice(0, limit) : entries);

	let editingId: string | null = $state(null);
	let editWeight = $state('');
	let editNotes = $state('');
	const startEdit = (entry: DexieWeightEntry) => {
		editingId = entry.id;
		editWeight = String(round2(entry.weightKg));
		editNotes = entry.notes ?? '';
	};

	const cancelEdit = () => {
		editingId = null;
	};

	const saveEdit = async () => {
		if (!editingId) return;
		const kg = parseFloat(editWeight);
		if (isNaN(kg) || kg < 20 || kg > 500) return;

		await weightService.update(editingId, { weightKg: kg, notes: editNotes || undefined });
		editingId = null;
		onChanged?.();
	};

	const deleteEntry = async (id: string) => {
		await weightService.delete(id);
		onChanged?.();
	};

	const formatDate = (iso: string) =>
		new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});
</script>

<div class="space-y-2">
	{#if entries.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.weight_no_entries()}</p>
	{:else}
		{#each displayed as entry (entry.id)}
			<div class="flex items-center gap-3 rounded-lg border px-3 py-2">
				{#if editingId === entry.id}
					<div class="flex flex-1 items-center gap-2">
						<Input
							type="number"
							step="0.1"
							min="20"
							max="500"
							class="w-24"
							bind:value={editWeight}
						/>
						<span class="text-sm text-muted-foreground">kg</span>
						<Input
							type="text"
							class="flex-1"
							placeholder={m.weight_notes_label()}
							bind:value={editNotes}
						/>
					</div>
					<Button variant="ghost" size="icon" onclick={saveEdit}>
						<Check class="size-4" />
					</Button>
					<Button variant="ghost" size="icon" onclick={cancelEdit}>
						<X class="size-4" />
					</Button>
				{:else}
					<div class="flex-1 min-w-0">
						<div class="flex items-baseline gap-2">
							<span class="font-medium tabular-nums">{entry.weightKg.toFixed(1)} kg</span>
							<span class="text-sm text-muted-foreground">{formatDate(entry.entryDate)}</span>
							<span class="text-xs text-muted-foreground">{formatTime(entry.loggedAt)}</span>
						</div>
						{#if entry.notes}
							<p class="text-sm text-muted-foreground truncate">{entry.notes}</p>
						{/if}
					</div>
					<Button variant="ghost" size="icon" onclick={() => startEdit(entry)}>
						<Pencil class="size-4" />
					</Button>
					<DeleteButton
						onDelete={() => deleteEntry(entry.id)}
						title={m.weight_delete()}
						description={m.weight_confirm_delete()}
					/>
				{/if}
			</div>
		{/each}
	{/if}
</div>
