<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import AmountInput from '$lib/components/entries/AmountInput.svelte';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import X from '@lucide/svelte/icons/x';
	import { round2 } from '$lib/utils/number';
	import { timeToIsoString, formatTime24h } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';
	import NutrientCategoryInputs from '$lib/components/foods/NutrientCategoryInputs.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import { DEFAULT_VISIBLE_NUTRIENTS } from '$lib/nutrients';

	const formId = $props.id();

	type Props = {
		open?: boolean;
		date: string;
		entry: {
			id: string;
			servings: number;
			mealType: string;
			foodName?: string;
			servingSize?: number | null;
			servingUnit?: string | null;
			calories?: number | null;
			eatenAt?: string | null;
			quickCalories?: number | null;
			quickProtein?: number | null;
			quickCarbs?: number | null;
			quickFat?: number | null;
			quickFiber?: number | null;
			quickNutrients?: Record<string, number> | null;
			quickName?: string | null;
		} | null;
		onClose: () => void;
		onSave: (payload: {
			id: string;
			servings: number;
			mealType: string;
			date: string;
			eatenAt?: string;
			quickName?: string | null;
			quickCalories?: number | null;
			quickProtein?: number | null;
			quickCarbs?: number | null;
			quickFat?: number | null;
			quickFiber?: number | null;
			quickNutrients?: Record<string, number> | null;
		}) => void;
		onDelete: (id: string) => void;
	};

	let { open = $bindable(false), date, entry, onClose, onSave, onDelete }: Props = $props();

	let wasOpen = $state(false);
	$effect(() => {
		if (wasOpen && !open) {
			onClose();
		}
		wasOpen = open;
	});

	let editServings = $state(1);
	let editMealType = $state('');
	let editDate = $state('');
	let editTime = $state('');

	let editQuickName = $state('');
	let editQuickCalories = $state<number | null>(null);
	let editQuickProtein = $state<number | null>(null);
	let editQuickCarbs = $state<number | null>(null);
	let editQuickFat = $state<number | null>(null);
	let editQuickFiber = $state<number | null>(null);
	let editQuickNutrients = $state<Record<string, number>>({});
	let editNutrientsOpen = $state(false);

	const cachedPrefs = useLiveQuery(() => preferencesService.preferences(), undefined);
	let visibleNutrients = $derived(cachedPrefs.value?.visibleNutrients ?? DEFAULT_VISIBLE_NUTRIENTS);

	const setQuickNutrient = (key: string, value: number | null) => {
		if (value == null) {
			delete editQuickNutrients[key];
		} else {
			editQuickNutrients[key] = value;
		}
	};

	const isQuickEntry = $derived(entry?.quickCalories != null);

	let editMacroCalories = $derived(
		(editQuickProtein ?? 0) * 4 + (editQuickCarbs ?? 0) * 4 + (editQuickFat ?? 0) * 9
	);
	let editHasMacros = $derived(
		(editQuickProtein != null || editQuickCarbs != null || editQuickFat != null) &&
			editQuickCalories != null
	);
	let editMacrosMatch = $derived(
		Math.round(editMacroCalories) === Math.round(editQuickCalories ?? 0)
	);

	$effect(() => {
		if (entry) {
			editServings = round2(entry.servings);
			editMealType = entry.mealType;
			editDate = date;
			editTime = formatTime24h(entry.eatenAt);
			if (entry.quickCalories != null) {
				editQuickName = entry.quickName ?? '';
				editQuickCalories = entry.quickCalories;
				editQuickProtein = entry.quickProtein ?? null;
				editQuickCarbs = entry.quickCarbs ?? null;
				editQuickFat = entry.quickFat ?? null;
				editQuickFiber = entry.quickFiber ?? null;
				editQuickNutrients = entry.quickNutrients ? { ...entry.quickNutrients } : {};
				editNutrientsOpen = Object.keys(editQuickNutrients).length > 0;
			}
		}
	});

	const handleSave = () => {
		if (!entry) return;
		const eatenAt = timeToIsoString(editTime, editDate) ?? undefined;
		if (isQuickEntry) {
			const cal = editQuickCalories;
			if (!cal || cal < 0) return;
			onSave({
				id: entry.id,
				servings: 1,
				mealType: editMealType,
				date: editDate,
				eatenAt,
				quickName: editQuickName.trim() || null,
				quickCalories: cal,
				quickProtein: editQuickProtein,
				quickCarbs: editQuickCarbs,
				quickFat: editQuickFat,
				quickFiber: editQuickFiber,
				quickNutrients: Object.keys(editQuickNutrients).length ? { ...editQuickNutrients } : null
			});
		} else {
			onSave({
				id: entry.id,
				servings: editServings,
				mealType: editMealType,
				date: editDate,
				eatenAt
			});
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

<ResponsiveModal bind:open title={m.edit_entry_title()} description={entry?.foodName} openFull>
	<div class="grid gap-4">
		{#if isQuickEntry}
			<div class="grid gap-3">
				<div class="grid gap-1.5">
					<Label for={`${formId}-field-1`}>{m.quick_log_name_placeholder()}</Label>
					<Input id={`${formId}-field-1`} bind:value={editQuickName} />
				</div>
				<div class="grid gap-1.5">
					<Label for={`${formId}-input-1`}>{m.quick_log_calories()}</Label>
					<NumberInput id={`${formId}-input-1`} bind:value={editQuickCalories} />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-1.5">
						<Label class="text-xs" for={`${formId}-input-2`}>{m.quick_log_protein()}</Label>
						<NumberInput id={`${formId}-input-2`} bind:value={editQuickProtein} />
					</div>
					<div class="grid gap-1.5">
						<Label class="text-xs" for={`${formId}-input-3`}>{m.quick_log_carbs()}</Label>
						<NumberInput id={`${formId}-input-3`} bind:value={editQuickCarbs} />
					</div>
					<div class="grid gap-1.5">
						<Label class="text-xs" for={`${formId}-input-4`}>{m.quick_log_fat()}</Label>
						<NumberInput id={`${formId}-input-4`} bind:value={editQuickFat} />
					</div>
					<div class="grid gap-1.5">
						<Label class="text-xs" for={`${formId}-input-5`}>{m.quick_log_fiber()}</Label>
						<NumberInput id={`${formId}-input-5`} bind:value={editQuickFiber} />
					</div>
				</div>
				{#if editHasMacros}
					<div
						class="flex items-center gap-1.5 text-xs {editMacrosMatch
							? 'text-green-600 dark:text-green-400'
							: 'text-amber-600 dark:text-amber-400'}"
					>
						{#if editMacrosMatch}
							<CircleCheck class="size-3.5" />
						{:else}
							<TriangleAlert class="size-3.5" />
						{/if}
						{m.quick_log_macro_calories({ calories: Math.round(editMacroCalories) })}
					</div>
				{/if}
				<button
					type="button"
					class="flex items-center gap-1 text-sm text-muted-foreground"
					onclick={() => (editNutrientsOpen = !editNutrientsOpen)}
				>
					{#if editNutrientsOpen}
						<ChevronUp class="size-4" />
					{:else}
						<ChevronDown class="size-4" />
					{/if}
					{m.quick_log_nutrients()}
				</button>
				{#if editNutrientsOpen}
					<div class="space-y-2">
						<NutrientCategoryInputs
							values={editQuickNutrients}
							onChange={setQuickNutrient}
							{visibleNutrients}
							idPrefix="edit-quick-"
						/>
					</div>
				{/if}
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
			<Label for={`${formId}-field-2`}>{m.edit_entry_meal()}</Label>
			<Select.Root type="single" bind:value={editMealType}>
				<Select.Trigger id={`${formId}-field-2`}>
					{mealOptions.find((o) => o.value === editMealType)?.label || m.edit_entry_select_meal()}
				</Select.Trigger>
				<Select.Content>
					{#each mealOptions as meal}
						<Select.Item value={meal.value}>{meal.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div class="grid gap-2">
				<Label for={`${formId}-field-3`}>{m.edit_entry_date()}</Label>
				<Input
					id={`${formId}-field-3`}
					type="date"
					min="1900-01-01"
					max="2100-12-31"
					bind:value={editDate}
				/>
			</div>
			<div class="grid gap-2">
				<Label for={`${formId}-field-4`}>{m.edit_entry_time()}</Label>
				<Input id={`${formId}-field-4`} type="time" bind:value={editTime} />
			</div>
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
				<Button
					class="flex-1 sm:flex-none"
					aria-label={m.edit_entry_save()}
					disabled={!editDate ||
						editDate < '1900-01-01' ||
						editDate > '2100-12-31' ||
						(isQuickEntry && (editQuickCalories == null || editQuickCalories <= 0))}
					onclick={handleSave}
				>
					<Check class="size-4" />
					<span class="hidden sm:inline">{m.edit_entry_save()}</span>
				</Button>
			</div>
		</div>
	</div>
</ResponsiveModal>
