<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open?: boolean;
		entry: { id: string; servings: number; mealType: string; foodName?: string } | null;
		onClose: () => void;
		onSave: (payload: { id: string; servings: number; mealType: string }) => void;
		onDelete: (id: string) => void;
	};

	let { open = false, entry, onClose, onSave, onDelete }: Props = $props();

	let editServings = $state(1);
	let editMealType = $state('');

	$effect(() => {
		if (entry) {
			editServings = entry.servings;
			editMealType = entry.mealType;
		}
	});

	const handleSave = () => {
		if (entry) {
			onSave({ id: entry.id, servings: editServings, mealType: editMealType });
		}
	};

	const handleDelete = () => {
		if (entry) {
			onDelete(entry.id);
		}
	};

	const mealOptions = $derived([
		{ value: 'Breakfast', label: m.meal_breakfast() },
		{ value: 'Lunch', label: m.meal_lunch() },
		{ value: 'Dinner', label: m.meal_dinner() },
		{ value: 'Snacks', label: m.meal_snacks() }
	]);
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && onClose()}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.edit_entry_title()}</Dialog.Title>
			{#if entry?.foodName}
				<Dialog.Description>{entry.foodName}</Dialog.Description>
			{/if}
		</Dialog.Header>

		<div class="grid gap-4">
			<div class="grid gap-2">
				<Label for="edit-servings">{m.edit_entry_servings()}</Label>
				<Input
					id="edit-servings"
					type="number"
					bind:value={editServings}
					min="0.1"
					step="0.1"
				/>
			</div>

			<div class="grid gap-2">
				<Label>{m.edit_entry_meal()}</Label>
				<Select.Root type="single" bind:value={editMealType}>
					<Select.Trigger>
						{mealOptions.find((o) => o.value === editMealType)?.label || m.edit_entry_select_meal()}
					</Select.Trigger>
					<Select.Content>
						{#each mealOptions as meal}
							<Select.Item value={meal.value}>{meal.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		</div>

		<Dialog.Footer class="flex flex-row items-center justify-between">
			<Button variant="ghost" size="icon" class="text-destructive hover:text-destructive" onclick={handleDelete} aria-label={m.edit_entry_delete()}>
				<Trash2 class="size-4" />
			</Button>
			<div class="flex gap-2">
				<Button variant="outline" onclick={onClose}>{m.edit_entry_cancel()}</Button>
				<Button onclick={handleSave}>
					<Check class="size-4" />
					{m.edit_entry_save()}
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
