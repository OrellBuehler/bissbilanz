<script lang="ts">
	import { onMount } from 'svelte';
	import SupplementForm from '$lib/components/supplements/SupplementForm.svelte';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import History from '@lucide/svelte/icons/history';
	import { formatSchedule } from '$lib/utils/supplements';
	import type { ScheduleType } from '$lib/supplement-units';
	import { api } from '$lib/api/client';
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
	const loadSupplements = async () => {
		const { data } = await api.GET('/api/supplements', {
			params: { query: { all: true } }
		});
		if (data) {
			supplements = data.supplements;
		}
	};

	const createSupplement = async (payload: Record<string, unknown>) => {
		await api.POST('/api/supplements', { body: payload as any });
		showForm = false;
		await loadSupplements();
	};

	const updateSupplement = async (payload: Record<string, unknown>) => {
		if (!editingSupplement) return;
		await api.PATCH('/api/supplements/{id}', {
			params: { path: { id: editingSupplement.id } },
			body: payload as any
		});
		editingSupplement = null;
		showForm = false;
		await loadSupplements();
	};

	const deleteSupplement = async (id: string) => {
		await api.DELETE('/api/supplements/{id}', {
			params: { path: { id } }
		});
		await loadSupplements();
	};

	const toggleActive = async (supplement: SupplementWithIngredients) => {
		await api.PATCH('/api/supplements/{id}', {
			params: { path: { id: supplement.id } },
			body: { isActive: !supplement.isActive }
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
		<div class="flex gap-2">
			<Button variant="outline" size="sm" href="/supplements/history">
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
								{supplement.dosage}
								{supplement.dosageUnit} &middot; {formatSchedule(
									supplement.scheduleType as ScheduleType,
									supplement.scheduleDays
								)}
								{#if supplement.ingredients?.length > 0}
									&middot; {supplement.ingredients.length === 1
										? m.supplements_ingredient_count_one()
										: m.supplements_ingredient_count({
												count: String(supplement.ingredients.length)
											})}
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
						<DeleteButton
							onDelete={() => deleteSupplement(supplement.id)}
							title={m.supplements_delete()}
							description={m.supplements_delete_confirm()}
						/>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<ResponsiveModal
	bind:open={showForm}
	title={editingSupplement ? m.supplements_edit() : m.supplements_add()}
>
	<SupplementForm
		supplement={editingSupplement}
		onSave={editingSupplement ? updateSupplement : createSupplement}
		onCancel={closeForm}
	/>
</ResponsiveModal>
