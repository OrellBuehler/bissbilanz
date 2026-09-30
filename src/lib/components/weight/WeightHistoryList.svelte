<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { weightService } from '$lib/services/weight-service.svelte';
	import { round2, formatKg } from '$lib/utils/number';
	import { formatTime } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';
	import type { DexieWeightEntry } from '$lib/db/types';

	let {
		entries,
		onChanged,
		limit
	}: { entries: DexieWeightEntry[]; onChanged?: () => void; limit?: number } = $props();

	const PER_PAGE = 10;
	let page = $state(1);
	const paginated = $derived(limit == null && entries.length > PER_PAGE);
	const totalPages = $derived(Math.max(1, Math.ceil(entries.length / PER_PAGE)));
	const displayed = $derived(
		limit != null ? entries.slice(0, limit) : entries.slice((page - 1) * PER_PAGE, page * PER_PAGE)
	);

	$effect(() => {
		if (page > totalPages) page = totalPages;
	});

	let editingId: string | null = $state(null);
	let editWeight = $state<number | null>(null);
	let editNotes = $state('');
	const startEdit = (entry: DexieWeightEntry) => {
		editingId = entry.id;
		editWeight = round2(entry.weightKg);
		editNotes = entry.notes ?? '';
	};

	const cancelEdit = () => {
		editingId = null;
	};

	const saveEdit = async () => {
		if (!editingId) return;
		const kg = editWeight;
		if (kg == null || kg < 20 || kg > 500) return;

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
						<NumberInput class="w-24" bind:value={editWeight} />
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
							<span class="font-medium tabular-nums">{formatKg(entry.weightKg)} kg</span>
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

{#if paginated}
	<Pagination.Root count={entries.length} perPage={PER_PAGE} bind:page class="mt-4">
		{#snippet children({ pages, currentPage })}
			<Pagination.Content>
				<Pagination.Item>
					<Pagination.PrevButton>
						<ChevronLeft class="size-4" />
						<span class="hidden sm:block">{m.pagination_previous()}</span>
					</Pagination.PrevButton>
				</Pagination.Item>
				{#each pages as p (p.key)}
					{#if p.type === 'ellipsis'}
						<Pagination.Item>
							<Pagination.Ellipsis />
						</Pagination.Item>
					{:else}
						<Pagination.Item>
							<Pagination.Link page={p} isActive={currentPage === p.value}>
								{p.value}
							</Pagination.Link>
						</Pagination.Item>
					{/if}
				{/each}
				<Pagination.Item>
					<Pagination.NextButton>
						<span class="hidden sm:block">{m.pagination_next()}</span>
						<ChevronRight class="size-4" />
					</Pagination.NextButton>
				</Pagination.Item>
			</Pagination.Content>
		{/snippet}
	</Pagination.Root>
{/if}
