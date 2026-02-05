<script lang="ts">
	import IngredientRow from './IngredientRow.svelte';
	import { buildRecipePayload, type RecipeFormState } from '$lib/utils/recipe-builder';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import Plus from '@lucide/svelte/icons/plus';

	type Props = {
		foods?: Array<{ id: string; name: string; servingUnit?: string }>;
		onSave: (payload: ReturnType<typeof buildRecipePayload>) => void;
		onCancel?: () => void;
	};

	let { foods = [], onSave, onCancel = () => {} }: Props = $props();

	let state: RecipeFormState = $state({
		name: '',
		totalServings: 1,
		ingredients: [{ foodId: '', quantity: 1, servingUnit: 'g' }]
	});

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

<Card.Root>
	<Card.Header>
		<Card.Title>New Recipe</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		<Input placeholder="Recipe name" bind:value={state.name} />
		<div class="flex items-center gap-2">
			<Label class="text-sm">Total servings:</Label>
			<Input
				class="w-20"
				type="number"
				min="1"
				step="1"
				bind:value={state.totalServings}
			/>
		</div>
		<div class="space-y-2">
			<Label class="text-sm font-medium">Ingredients</Label>
			{#each state.ingredients as ingredient, i}
				<IngredientRow {ingredient} {foods} onRemove={() => removeIngredient(i)} />
			{/each}
			<Button variant="outline" size="sm" onclick={addIngredient}>
				<Plus class="size-4" />
				Add ingredient
			</Button>
		</div>
	</Card.Content>
	<Card.Footer class="flex justify-end gap-2">
		<Button variant="outline" onclick={onCancel}>Cancel</Button>
		<Button onclick={handleSubmit}>Save recipe</Button>
	</Card.Footer>
</Card.Root>
