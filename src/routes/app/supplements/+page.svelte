<script lang="ts">
	import { onMount } from 'svelte';
	import SupplementForm from '$lib/components/supplements/SupplementForm.svelte';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import History from '@lucide/svelte/icons/history';
	import { formatSchedule } from '$lib/utils/supplements';
	import type { ScheduleType } from '$lib/supplement-units';
	import * as m from '$lib/paraglide/messages';

	type SupplementWithIngredients = {
		id: string;
		name: string;
		dosage: number;
		dosageUnit: string;
		scheduleType: string;
		scheduleDays: number[] | null;
		scheduleStartDate: string | null;
		timeOfDay: string | null;
		isActive: boolean;
		sortOrder: number;
		ingredients: { name: string; dosage: number; dosageUnit: string }[];
		createdAt: string | null;
		updatedAt: string | null;
	};

	let supplements: SupplementWithIngredients[] = $state([]);
	let showForm = $state(false);
	let editingSupplement: SupplementWithIngredients | null = $state(null);
	let deletingId: string | null = $state(null);

	const loadSupplements = async () => {
		const res = await fetch('/api/supplements?all=true');
		if (res.ok) {
			supplements = (await res.json()).supplements;
		}
	};

	const createSupplement = async (payload: Record<string, unknown>) => {
		await fetch('/api/supplements', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		showForm = false;
		await loadSupplements();
	};

	const updateSupplement = async (payload: Record<string, unknown>) => {
		if (!editingSupplement) return;
		await fetch(`/api/supplements/${editingSupplement.id}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		editingSupplement = null;
		showForm = false;
		await loadSupplements();
	};

	const deleteSupplement = async (id: string) => {
		await fetch(`/api/supplements/${id}`, { method: 'DELETE' });
		deletingId = null;
		await loadSupplements();
	};

	const toggleActive = async (supplement: SupplementWithIngredients) => {
		await fetch(`/api/supplements/${supplement.id}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ isActive: !supplement.isActive })
		});
		await loadSupplements();
	};

	const openEdit = (supplement: SupplementWithIngredients) => {
		editingSupplement = supplement;
		showForm = true;
	};

	const closeForm = () => {
		showForm = false;
		editingSupplement = null;
	};

	onMount(loadSupplements);
</script>

<div class="mx-auto max-w-2xl space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-2xl font-bold">{m.supplements_title()}</h1>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" href="/app/supplements/history">
				<History class="mr-1.5 size-4" />
				{m.supplements_history_title()}
			</Button>
			<Button size="sm" onclick={() => (showForm = true)}>
				<Plus class="mr-1.5 size-4" />
				{m.supplements_add()}
			</Button>
		</div>
	</div>

	{#if supplements.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.supplements_empty()}</p>
	{:else}
		<div class="space-y-3">
			{#each supplements as supplement (supplement.id)}
				<Card.Root class={supplement.isActive ? '' : 'opacity-60'}>
					<Card.Content class="flex items-center gap-4 py-3">
						<div class="flex-1 min-w-0">
							<div class="font-medium">{supplement.name}</div>
							<div class="text-sm text-muted-foreground">
								{supplement.dosage} {supplement.dosageUnit} &middot; {formatSchedule(supplement.scheduleType as ScheduleType, supplement.scheduleDays)}
								{#if supplement.ingredients?.length > 0}
									&middot; {supplement.ingredients.length === 1 ? m.supplements_ingredient_count_one() : m.supplements_ingredient_count({ count: String(supplement.ingredients.length) })}
								{/if}
							</div>
						</div>
						<Switch
							checked={supplement.isActive}
							onCheckedChange={() => toggleActive(supplement)}
						/>
						<Button variant="ghost" size="icon" onclick={() => openEdit(supplement)}>
							<Pencil class="size-4" />
						</Button>
						<Button variant="ghost" size="icon" onclick={() => (deletingId = supplement.id)}>
							<Trash2 class="size-4" />
						</Button>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<ResponsiveModal bind:open={showForm} title={editingSupplement ? m.supplements_edit() : m.supplements_add()}>
	<SupplementForm
		supplement={editingSupplement}
		onSave={editingSupplement ? updateSupplement : createSupplement}
		onCancel={closeForm}
	/>
</ResponsiveModal>

<AlertDialog.Root open={deletingId !== null}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.supplements_delete()}</AlertDialog.Title>
			<AlertDialog.Description>{m.supplements_delete_confirm()}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (deletingId = null)}>{m.supplements_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={() => deletingId && deleteSupplement(deletingId)}>{m.supplements_delete()}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
