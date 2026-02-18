<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import X from '@lucide/svelte/icons/x';
	import { servingUnitValues } from '$lib/units';
	import * as m from '$lib/paraglide/messages';

	const unitLabels: Record<string, () => string> = {
		g: () => m.food_form_unit_g(),
		kg: () => m.food_form_unit_kg(),
		ml: () => m.food_form_unit_ml(),
		l: () => m.food_form_unit_l(),
		oz: () => m.food_form_unit_oz(),
		lb: () => m.food_form_unit_lb(),
		fl_oz: () => m.food_form_unit_fl_oz(),
		cup: () => m.food_form_unit_cup(),
		tbsp: () => m.food_form_unit_tbsp(),
		tsp: () => m.food_form_unit_tsp()
	};

	type Props = {
		ingredient: { foodId: string; quantity: number; servingUnit: string };
		foods?: Array<{ id: string; name: string; servingUnit?: string }>;
		onRemove?: () => void;
	};

	let { ingredient, foods = [], onRemove = () => {} }: Props = $props();

	const handleFoodChange = (value: string) => {
		ingredient.foodId = value;
		const food = foods.find((f) => f.id === value);
		if (food?.servingUnit) {
			ingredient.servingUnit = food.servingUnit;
		}
	};

	const selectedFood = $derived(foods.find((f) => f.id === ingredient.foodId));
</script>

<div class="flex items-center gap-2">
	<Select.Root type="single" value={ingredient.foodId} onValueChange={handleFoodChange}>
		<Select.Trigger class="flex-1">
			{selectedFood?.name || m.recipe_form_select_food()}
		</Select.Trigger>
		<Select.Content>
			{#each foods as food}
				<Select.Item value={food.id}>{food.name}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
	<Input
		class="w-20"
		type="number"
		placeholder={m.recipe_form_qty()}
		bind:value={ingredient.quantity}
		min="0.1"
		step="0.1"
	/>
	<Select.Root type="single" value={ingredient.servingUnit} onValueChange={(v) => (ingredient.servingUnit = v)}>
		<Select.Trigger class="w-24">
			{unitLabels[ingredient.servingUnit]?.() ?? ingredient.servingUnit}
		</Select.Trigger>
		<Select.Content>
			{#each servingUnitValues as unit}
				<Select.Item value={unit}>{unitLabels[unit]?.() ?? unit}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
	<Button variant="ghost" size="icon" onclick={onRemove}>
		<X class="size-4 text-destructive" />
	</Button>
</div>
