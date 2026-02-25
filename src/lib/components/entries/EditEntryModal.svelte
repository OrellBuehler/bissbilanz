<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open?: boolean;
		entry: { id: string; servings: number; mealType: string; foodName?: string } | null;
		onClose: () => void;
		onSave: (payload: { id: string; servings: number; mealType: string }) => void;
		onDelete: (id: string) => void;
	};

	let { open = $bindable(false), entry, onClose, onSave, onDelete }: Props = $props();

	let wasOpen = $state(false);
	$effect(() => {
		if (wasOpen && !open) {
			onClose();
		}
		wasOpen = open;
	});

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

<ResponsiveModal bind:open title={m.edit_entry_title()} description={entry?.foodName}>
	<div class="grid gap-4">
		<div class="grid gap-2">
			<Label for="edit-servings">{m.edit_entry_servings()}</Label>
			<Input id="edit-servings" type="number" bind:value={editServings} min="0.1" step="0.1" />
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

		<div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
			<Button
				variant="ghost"
				size="icon"
				class="self-start text-destructive hover:text-destructive sm:self-auto"
				onclick={handleDelete}
				aria-label={m.edit_entry_delete()}
			>
				<Trash2 class="size-4" />
			</Button>
			<div class="flex w-full gap-2 sm:w-auto">
				<Button
					variant="outline"
					class="flex-1 sm:flex-none"
					aria-label={m.edit_entry_cancel()}
					onclick={() => (open = false)}
				>
					<X class="size-4" />
					<span class="hidden sm:inline">{m.edit_entry_cancel()}</span>
				</Button>
				<Button class="flex-1 sm:flex-none" aria-label={m.edit_entry_save()} onclick={handleSave}>
					<Check class="size-4" />
					<span class="hidden sm:inline">{m.edit_entry_save()}</span>
				</Button>
			</div>
		</div>
	</div>
</ResponsiveModal>
