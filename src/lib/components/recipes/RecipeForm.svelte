<script lang="ts">
	import IngredientRow from './IngredientRow.svelte';
	import { buildRecipePayload, type RecipeFormState } from '$lib/utils/recipe-builder';

	export let foods: Array<{ id: string; name: string; servingUnit?: string }> = [];
	export let onSave: (payload: ReturnType<typeof buildRecipePayload>) => void;
	export let onCancel: () => void = () => {};

	let state: RecipeFormState = {
		name: '',
		totalServings: 1,
		ingredients: [{ foodId: '', quantity: 1, servingUnit: 'g' }]
	};

	const addIngredient = () => {
		state.ingredients = [...state.ingredients, { foodId: '', quantity: 1, servingUnit: 'g' }];
	};

	const removeIngredient = (index: number) => {
		state.ingredients = state.ingredients.filter((_, i) => i !== index);
	};

	const handleSubmit = () => {
		const payload = buildRecipePayload(state);
		if (payload.name && payload.ingredients.length > 0) {
			onSave(payload);
			state = { name: '', totalServings: 1, ingredients: [{ foodId: '', quantity: 1, servingUnit: 'g' }] };
		}
	};
</script>

<div class="space-y-4 rounded border p-4">
	<h2 class="font-medium">New Recipe</h2>
	<input
		class="w-full rounded border p-2"
		placeholder="Recipe name"
		bind:value={state.name}
	/>
	<div class="flex items-center gap-2">
		<label class="text-sm">Total servings:</label>
		<input
			class="w-20 rounded border p-2"
			type="number"
			min="1"
			step="1"
			bind:value={state.totalServings}
		/>
	</div>
	<div class="space-y-2">
		<label class="text-sm font-medium">Ingredients</label>
		{#each state.ingredients as ingredient, i}
			<IngredientRow {ingredient} {foods} onRemove={() => removeIngredient(i)} />
		{/each}
		<button class="rounded border px-3 py-1 text-sm" onclick={addIngredient}>
			+ Add ingredient
		</button>
	</div>
	<div class="flex justify-end gap-2">
		<button class="rounded border px-3 py-1" onclick={onCancel}>Cancel</button>
		<button class="rounded bg-black px-4 py-2 text-white" onclick={handleSubmit}>
			Save recipe
		</button>
	</div>
</div>
