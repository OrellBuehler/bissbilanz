<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import X from '@lucide/svelte/icons/x';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import { servingUnitValues, unitDimension, type ServingUnit } from '$lib/units';
	import { filterFoods } from '$lib/components/foods/foodFilters';
	import * as m from '$lib/paraglide/messages';

	const unitLabels: Record<string, () => string> = {
		g: () => m.food_form_unit_g(),
		kg: () => m.food_form_unit_kg(),
		ml: () => m.food_form_unit_ml(),
		cl: () => m.food_form_unit_cl(),
		l: () => m.food_form_unit_l(),
		oz: () => m.food_form_unit_oz(),
		lb: () => m.food_form_unit_lb(),
		fl_oz: () => m.food_form_unit_fl_oz(),
		cup: () => m.food_form_unit_cup(),
		tbsp: () => m.food_form_unit_tbsp(),
		tsp: () => m.food_form_unit_tsp()
	};

	type IngredientFood = {
		id: string;
		name: string;
		servingUnit?: string;
		brand?: string | null;
		labels?: string[] | null;
	};

	type Props = {
		ingredient: { foodId: string; quantity: number; servingUnit: string };
		foods?: IngredientFood[];
		onRemove?: () => void;
	};

	let { ingredient, foods = [], onRemove = () => {} }: Props = $props();

	let foodPickerOpen = $state(false);
	let foodQuery = $state('');

	const handleFoodChange = (value: string) => {
		ingredient.foodId = value;
		const food = foods.find((f) => f.id === value);
		if (food?.servingUnit) {
			ingredient.servingUnit = food.servingUnit;
		}
		foodPickerOpen = false;
		foodQuery = '';
	};

	const selectedFood = $derived(foods.find((f) => f.id === ingredient.foodId));
	const filteredFoods = $derived(filterFoods(foods, foodQuery));

	// Only offer units in the same dimension (mass or volume) as the selected
	// food's own unit — a cross-dimension unit has no valid conversion.
	const compatibleUnits = $derived(
		selectedFood?.servingUnit
			? servingUnitValues.filter(
					(unit) => unitDimension(unit) === unitDimension(selectedFood.servingUnit as ServingUnit)
				)
			: servingUnitValues
	);
</script>

<div class="flex items-center gap-2">
	<Popover.Root bind:open={foodPickerOpen}>
		<Popover.Trigger class="flex-1">
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					role="combobox"
					aria-expanded={foodPickerOpen}
					class="w-full min-w-0 flex-1 justify-between font-normal"
				>
					<span class="truncate">{selectedFood?.name || m.recipe_form_select_food()}</span>
					<ChevronsUpDown class="size-4 shrink-0 opacity-50" />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-[--bits-popover-anchor-width] p-0">
			<Command.Root shouldFilter={false}>
				<Command.Input placeholder={m.add_food_search_placeholder()} bind:value={foodQuery} />
				<Command.List>
					<Command.Empty>{m.recipe_form_no_foods()}</Command.Empty>
					<Command.Group>
						{#each filteredFoods as food (food.id)}
							<Command.Item value={food.id} onSelect={() => handleFoodChange(food.id)}>
								{food.name}
							</Command.Item>
						{/each}
					</Command.Group>
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
	<NumberInput
		class="w-20"
		placeholder={m.recipe_form_qty()}
		bind:value={() => ingredient.quantity, (v) => (ingredient.quantity = v ?? 0.1)}
	/>
	<Select.Root
		type="single"
		value={ingredient.servingUnit}
		onValueChange={(v) => (ingredient.servingUnit = v)}
	>
		<Select.Trigger class="w-24">
			{unitLabels[ingredient.servingUnit]?.() ?? ingredient.servingUnit}
		</Select.Trigger>
		<Select.Content>
			{#each compatibleUnits as unit}
				<Select.Item value={unit}>{unitLabels[unit]?.() ?? unit}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
	<Button variant="ghost" size="icon" onclick={onRemove}>
		<X class="size-4 text-destructive" />
	</Button>
</div>
