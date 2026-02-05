<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

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

	const mealOptions = [
		{ value: 'Breakfast', label: 'Breakfast' },
		{ value: 'Lunch', label: 'Lunch' },
		{ value: 'Dinner', label: 'Dinner' },
		{ value: 'Snacks', label: 'Snacks' }
	];
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && onClose()}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Edit Entry</Dialog.Title>
			{#if entry?.foodName}
				<Dialog.Description>{entry.foodName}</Dialog.Description>
			{/if}
		</Dialog.Header>

		<div class="grid gap-4">
			<div class="grid gap-2">
				<Label for="edit-servings">Servings</Label>
				<Input
					id="edit-servings"
					type="number"
					bind:value={editServings}
					min="0.1"
					step="0.1"
				/>
			</div>

			<div class="grid gap-2">
				<Label>Meal</Label>
				<Select.Root type="single" bind:value={editMealType}>
					<Select.Trigger>
						{mealOptions.find((m) => m.value === editMealType)?.label || 'Select meal'}
					</Select.Trigger>
					<Select.Content>
						{#each mealOptions as meal}
							<Select.Item value={meal.value}>{meal.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		</div>

		<Dialog.Footer class="flex justify-between sm:justify-between">
			<Button variant="destructive" onclick={handleDelete}>Delete</Button>
			<div class="flex gap-2">
				<Button variant="outline" onclick={onClose}>Cancel</Button>
				<Button onclick={handleSave}>Save</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
