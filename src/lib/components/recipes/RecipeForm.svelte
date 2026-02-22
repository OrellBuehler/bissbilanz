<script lang="ts">
	import IngredientRow from './IngredientRow.svelte';
	import { buildRecipePayload, type RecipeFormState } from '$lib/utils/recipe-builder';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		foods?: Array<{ id: string; name: string; servingUnit?: string }>;
		onSave: (payload: ReturnType<typeof buildRecipePayload>) => Promise<void>;
	};

	let { foods = [], onSave }: Props = $props();

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

	const handleSubmit = async (e: SubmitEvent) => {
		e.preventDefault();
		const payload = buildRecipePayload(state);
		if (payload.name && payload.ingredients.length > 0) {
			await onSave(payload);
			state = {
				name: '',
				totalServings: 1,
				ingredients: [{ foodId: '', quantity: 1, servingUnit: 'g' }]
			};
		}
	};
</script>

<form class="space-y-4" onsubmit={handleSubmit}>
	<div>
		<Label class="text-sm">{m.recipe_form_name()}</Label>
		<Input placeholder={m.recipe_form_name()} bind:value={state.name} />
	</div>
	<div class="flex items-center gap-2">
		<Label class="text-sm">{m.recipe_form_servings()}</Label>
		<Input class="w-20" type="number" min="1" step="1" bind:value={state.totalServings} />
	</div>
	<div class="space-y-2">
		<Label class="text-sm font-medium">{m.recipe_form_ingredients()}</Label>
		{#each state.ingredients as ingredient, i}
			<IngredientRow {ingredient} {foods} onRemove={() => removeIngredient(i)} />
		{/each}
		<Button variant="outline" size="sm" type="button" onclick={addIngredient}>
			<Plus class="size-4" />
			{m.recipe_form_add_ingredient()}
		</Button>
	</div>
	<Button class="w-full" type="submit">
		<Check class="size-4" />
		{m.recipe_form_save()}
	</Button>
</form>
