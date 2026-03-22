<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import { sleepService } from '$lib/services/sleep-service.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { DexieSleepEntry } from '$lib/db/types';

	let { entries, onChanged }: { entries: DexieSleepEntry[]; onChanged?: () => void } = $props();

	let editingId: string | null = $state(null);
	let editHours = $state(0);
	let editMinutes = $state(0);
	let editQuality = $state(7);
	let editNotes = $state('');

	const startEdit = (entry: DexieSleepEntry) => {
		editingId = entry.id;
		editHours = Math.floor(entry.durationMinutes / 60);
		editMinutes = entry.durationMinutes % 60;
		editQuality = entry.quality;
		editNotes = entry.notes ?? '';
	};

	const cancelEdit = () => {
		editingId = null;
	};

	const saveEdit = async () => {
		if (!editingId) return;
		const durationMinutes = Number(editHours) * 60 + Number(editMinutes);
		if (durationMinutes <= 0) return;
		await sleepService.update(editingId, {
			durationMinutes,
			quality: editQuality,
			notes: editNotes || null
		});
		editingId = null;
		onChanged?.();
	};

	const deleteEntry = async (id: string) => {
		await sleepService.delete(id);
		onChanged?.();
	};

	const formatDate = (iso: string) =>
		new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});

	const formatDuration = (entry: DexieSleepEntry) => {
		const h = Math.floor(entry.durationMinutes / 60);
		const min = entry.durationMinutes % 60;
		return m.sleep_hours({ hours: String(h), minutes: String(min) });
	};

	const qualityColor = (q: number) => {
		if (q >= 8) return '#22c55e';
		if (q >= 5) return '#f59e0b';
		return '#ef4444';
	};
</script>

<div class="space-y-2">
	{#if entries.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.sleep_no_entries()}</p>
	{:else}
		{#each entries as entry (entry.id)}
			<div class="flex items-center gap-3 rounded-lg border px-3 py-2">
				{#if editingId === entry.id}
					<div class="flex flex-1 flex-wrap items-center gap-2">
						<div class="flex items-center gap-1">
							<Input type="number" min="0" max="23" class="w-16" bind:value={editHours} />
							<span class="text-sm text-muted-foreground">h</span>
							<Input type="number" min="0" max="59" class="w-16" bind:value={editMinutes} />
							<span class="text-sm text-muted-foreground">m</span>
						</div>
						<div class="flex items-center gap-1">
							<Input type="number" min="1" max="10" class="w-16" bind:value={editQuality} />
							<span class="text-xs text-muted-foreground">/10</span>
						</div>
						<Input
							type="text"
							class="min-w-0 flex-1"
							placeholder={m.sleep_notes_label()}
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
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium tabular-nums">{formatDuration(entry)}</span>
							<div class="flex items-center gap-1">
								<span
									class="inline-block size-2 rounded-full"
									style="background-color: {qualityColor(entry.quality)}"
								></span>
								<span class="text-sm tabular-nums">{entry.quality}/10</span>
							</div>
							<span class="text-sm text-muted-foreground">{formatDate(entry.entryDate)}</span>
							{#if entry.bedtime || entry.wakeTime}
								<span class="text-xs text-muted-foreground">
									{entry.bedtime ?? '—'} → {entry.wakeTime ?? '—'}
								</span>
							{/if}
						</div>
						{#if entry.notes}
							<p class="truncate text-sm text-muted-foreground">{entry.notes}</p>
						{/if}
					</div>
					<Button variant="ghost" size="icon" onclick={() => startEdit(entry)}>
						<Pencil class="size-4" />
					</Button>
					<DeleteButton
						onDelete={() => deleteEntry(entry.id)}
						title={m.sleep_delete()}
						description={m.sleep_confirm_delete()}
					/>
				{/if}
			</div>
		{/each}
	{/if}
</div>
