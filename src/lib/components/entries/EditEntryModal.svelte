<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import AmountInput from '$lib/components/entries/AmountInput.svelte';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import { round2 } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open?: boolean;
		entry: {
			id: string;
			servings: number;
			mealType: string;
			foodName?: string;
			servingSize?: number | null;
			servingUnit?: string | null;
			calories?: number | null;
			quickCalories?: number | null;
			quickProtein?: number | null;
			quickCarbs?: number | null;
			quickFat?: number | null;
			quickFiber?: number | null;
			quickName?: string | null;
		} | null;
		onClose: () => void;
		onSave: (payload: {
			id: string;
			servings: number;
			mealType: string;
			quickName?: string | null;
			quickCalories?: number | null;
			quickProtein?: number | null;
			quickCarbs?: number | null;
			quickFat?: number | null;
			quickFiber?: number | null;
		}) => void;
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

	let editQuickName = $state('');
	let editQuickCalories = $state('');
	let editQuickProtein = $state('');
	let editQuickCarbs = $state('');
	let editQuickFat = $state('');
	let editQuickFiber = $state('');

	const isQuickEntry = $derived(entry?.quickCalories != null);

	$effect(() => {
		if (entry) {
			editServings = round2(entry.servings);
			editMealType = entry.mealType;
			if (entry.quickCalories != null) {
				editQuickName = entry.quickName ?? '';
				editQuickCalories = String(entry.quickCalories);
				editQuickProtein = entry.quickProtein != null ? String(entry.quickProtein) : '';
				editQuickCarbs = entry.quickCarbs != null ? String(entry.quickCarbs) : '';
				editQuickFat = entry.quickFat != null ? String(entry.quickFat) : '';
				editQuickFiber = entry.quickFiber != null ? String(entry.quickFiber) : '';
			}
		}
	});

	const handleSave = () => {
		if (!entry) return;
		if (isQuickEntry) {
			const cal = Number(editQuickCalories);
			if (!cal || cal < 0) return;
			onSave({
				id: entry.id,
				servings: 1,
				mealType: editMealType,
				quickName: editQuickName.trim() || null,
				quickCalories: cal,
				quickProtein: editQuickProtein ? Number(editQuickProtein) : null,
				quickCarbs: editQuickCarbs ? Number(editQuickCarbs) : null,
				quickFat: editQuickFat ? Number(editQuickFat) : null,
				quickFiber: editQuickFiber ? Number(editQuickFiber) : null
			});
		} else {
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
		{#if isQuickEntry}
			<div class="grid gap-3">
				<div class="grid gap-1.5">
					<Label>{m.quick_log_name_placeholder()}</Label>
					<Input bind:value={editQuickName} />
				</div>
				<div class="grid gap-1.5">
					<Label>{m.quick_log_calories()}</Label>
					<Input type="number" inputmode="decimal" min="0" bind:value={editQuickCalories} />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-1.5">
						<Label class="text-xs">{m.quick_log_protein()}</Label>
						<Input type="number" inputmode="decimal" min="0" bind:value={editQuickProtein} />
					</div>
					<div class="grid gap-1.5">
						<Label class="text-xs">{m.quick_log_carbs()}</Label>
						<Input type="number" inputmode="decimal" min="0" bind:value={editQuickCarbs} />
					</div>
					<div class="grid gap-1.5">
						<Label class="text-xs">{m.quick_log_fat()}</Label>
						<Input type="number" inputmode="decimal" min="0" bind:value={editQuickFat} />
					</div>
					<div class="grid gap-1.5">
						<Label class="text-xs">{m.quick_log_fiber()}</Label>
						<Input type="number" inputmode="decimal" min="0" bind:value={editQuickFiber} />
					</div>
				</div>
			</div>
		{:else}
			<AmountInput
				servings={editServings}
				servingSize={entry?.servingSize}
				servingUnit={entry?.servingUnit}
				caloriesPerServing={entry?.calories}
				onServingsChange={(v) => (editServings = v)}
			/>
		{/if}

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
			<DeleteButton
				onDelete={handleDelete}
				title={m.edit_entry_delete()}
				class="self-start sm:self-auto"
			/>
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
				<Button class="flex-1 sm:flex-none" aria-label={m.edit_entry_save()} disabled={isQuickEntry && (!editQuickCalories || Number(editQuickCalories) <= 0)} onclick={handleSave}>
					<Check class="size-4" />
					<span class="hidden sm:inline">{m.edit_entry_save()}</span>
				</Button>
			</div>
		</div>
	</div>
</ResponsiveModal>
