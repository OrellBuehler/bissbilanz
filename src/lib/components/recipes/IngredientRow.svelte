<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import X from '@lucide/svelte/icons/x';

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
			{selectedFood?.name || 'Select food'}
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
		placeholder="Qty"
		bind:value={ingredient.quantity}
		min="0.1"
		step="0.1"
	/>
	<Input
		class="w-20"
		placeholder="Unit"
		bind:value={ingredient.servingUnit}
	/>
	<Button variant="ghost" size="icon" onclick={onRemove}>
		<X class="size-4 text-destructive" />
	</Button>
</div>
