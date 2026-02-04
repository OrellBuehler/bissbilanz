<script lang="ts">
	export let ingredient: { foodId: string; quantity: number; servingUnit: string };
	export let foods: Array<{ id: string; name: string; servingUnit?: string }> = [];
	export let onRemove: () => void = () => {};

	const handleFoodChange = (e: Event) => {
		const select = e.target as HTMLSelectElement;
		ingredient.foodId = select.value;
		const food = foods.find((f) => f.id === select.value);
		if (food?.servingUnit) {
			ingredient.servingUnit = food.servingUnit;
		}
	};
</script>

<div class="flex items-center gap-2">
	<select class="flex-1 rounded border p-2" value={ingredient.foodId} onchange={handleFoodChange}>
		<option value="">Select food</option>
		{#each foods as food}
			<option value={food.id}>{food.name}</option>
		{/each}
	</select>
	<input
		class="w-20 rounded border p-2"
		type="number"
		placeholder="Qty"
		bind:value={ingredient.quantity}
		min="0.1"
		step="0.1"
	/>
	<input
		class="w-20 rounded border p-2"
		placeholder="Unit"
		bind:value={ingredient.servingUnit}
	/>
	<button class="rounded border px-2 py-1 text-red-500" onclick={onRemove}>×</button>
</div>
