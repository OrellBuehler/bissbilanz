<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import { apiFetch } from '$lib/utils/api';
	import * as m from '$lib/paraglide/messages';

	type WeightEntry = {
		id: string;
		weightKg: number;
		entryDate: string;
		notes: string | null;
		loggedAt: string;
	};

	let { entries, onChanged }: { entries: WeightEntry[]; onChanged: () => void } = $props();

	let editingId: string | null = $state(null);
	let editWeight = $state('');
	let editNotes = $state('');
	let deletingId: string | null = $state(null);

	const startEdit = (entry: WeightEntry) => {
		editingId = entry.id;
		editWeight = String(entry.weightKg);
		editNotes = entry.notes ?? '';
	};

	const cancelEdit = () => {
		editingId = null;
	};

	const saveEdit = async () => {
		if (!editingId) return;
		const kg = parseFloat(editWeight);
		if (isNaN(kg) || kg < 20 || kg > 500) return;

		await apiFetch(`/api/weight/${editingId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ weightKg: kg, notes: editNotes || undefined })
		});
		editingId = null;
		onChanged();
	};

	const confirmDelete = async () => {
		if (!deletingId) return;
		await apiFetch(`/api/weight/${deletingId}`, { method: 'DELETE' });
		deletingId = null;
		onChanged();
	};

	const formatDate = (iso: string) =>
		new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});

	const formatTime = (iso: string) =>
		new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
</script>

<div class="space-y-2">
	{#if entries.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.weight_no_entries()}</p>
	{:else}
		{#each entries as entry (entry.id)}
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
						<Input type="text" class="flex-1" placeholder={m.weight_notes_label()} bind:value={editNotes} />
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
					<Button variant="ghost" size="icon" onclick={() => (deletingId = entry.id)}>
						<Trash2 class="size-4" />
					</Button>
				{/if}
			</div>
		{/each}
	{/if}
</div>

<AlertDialog.Root open={deletingId !== null}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.weight_delete()}</AlertDialog.Title>
			<AlertDialog.Description>{m.weight_confirm_delete()}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (deletingId = null)}>{m.supplements_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirmDelete}>{m.weight_delete()}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
