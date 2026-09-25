<script lang="ts">
	import IngredientRow from './IngredientRow.svelte';
	import { buildRecipePayload, type RecipeFormState } from '$lib/utils/recipe-builder';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';
	import ImageUploadField from '$lib/components/shared/ImageUploadField.svelte';
	import ExtendedNutrientsList from '$lib/components/shared/ExtendedNutrientsList.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { ServingUnit } from '$lib/units';

	type IngredientFood = {
		id: string;
		name: string;
		servingUnit?: string;
		brand?: string | null;
		labels?: string[] | null;
	};

	export type RecipeFormPayload = ReturnType<typeof buildRecipePayload> & { isFavorite: boolean };

	type Props = {
		foods?: IngredientFood[];
		// When provided, the form starts pre-filled for editing instead of a
		// blank "new recipe" state, and does not reset after a successful save.
		recipe?: {
			name: string;
			totalServings: number;
			isFavorite: boolean;
			ingredients: Array<{ foodId: string; quantity: number; servingUnit: string }>;
		} | null;
		onSave: (payload: RecipeFormPayload) => Promise<void>;
		imageUrl?: string | null;
		onImageUpload?: (file: File) => Promise<void>;
		onImageRemove?: () => Promise<void>;
		uploading?: boolean;
		// Best-effort: only available when the edit form was opened online, since
		// it isn't cached offline like the rest of the recipe.
		extendedNutrients?: Record<string, number | null | undefined> | null;
	};

	let {
		foods = [],
		recipe = null,
		onSave,
		imageUrl,
		onImageUpload,
		onImageRemove,
		uploading = false,
		extendedNutrients = null
	}: Props = $props();

	const emptyIngredient = () => ({ foodId: '', quantity: 1, servingUnit: 'g' as ServingUnit });

	const initialState = (): RecipeFormState & { isFavorite: boolean } => ({
		name: recipe?.name ?? '',
		totalServings: recipe?.totalServings ?? 1,
		isFavorite: recipe?.isFavorite ?? false,
		ingredients:
			recipe && recipe.ingredients.length > 0
				? recipe.ingredients.map((i) => ({
						foodId: i.foodId,
						quantity: i.quantity,
						servingUnit: i.servingUnit as ServingUnit
					}))
				: [emptyIngredient()]
	});

	// svelte-ignore state_referenced_locally
	let formState: RecipeFormState & { isFavorite: boolean } = $state(initialState());
	let saving = $state(false);

	const addIngredient = () => {
		formState.ingredients = [...formState.ingredients, emptyIngredient()];
	};

	const removeIngredient = (index: number) => {
		formState.ingredients = formState.ingredients.filter((_, i) => i !== index);
	};

	const canSave = $derived(
		!saving &&
			formState.name.trim().length > 0 &&
			formState.totalServings > 0 &&
			formState.ingredients.length > 0
	);

	const handleSubmit = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!canSave) return;
		const payload: RecipeFormPayload = {
			...buildRecipePayload(formState),
			isFavorite: formState.isFavorite
		};
		if (payload.ingredients.length === 0) return;
		saving = true;
		try {
			await onSave(payload);
			// A create form clears for the next recipe; an edit form keeps
			// showing what was just saved.
			if (!recipe) formState = initialState();
		} finally {
			saving = false;
		}
	};
</script>

<form class="space-y-4" onsubmit={handleSubmit}>
	{#if onImageUpload}
		<ImageUploadField
			name={formState.name}
			{imageUrl}
			{uploading}
			onUpload={onImageUpload}
			onRemove={onImageRemove}
		/>
	{/if}
	<div class="flex items-center gap-3">
		<Switch bind:checked={formState.isFavorite} />
		<Label>{m.mark_as_favorite()}</Label>
	</div>
	<div>
		<Label class="text-sm">{m.recipe_form_name()}</Label>
		<Input placeholder={m.recipe_form_name()} bind:value={formState.name} />
	</div>
	<div class="flex items-center gap-2">
		<Label class="text-sm">{m.recipe_form_servings()}</Label>
		<NumberInput
			class="w-20"
			min="1"
			bind:value={() => formState.totalServings, (v) => (formState.totalServings = v ?? 1)}
		/>
	</div>
	<div class="space-y-2">
		<Label class="text-sm font-medium">{m.recipe_form_ingredients()}</Label>
		{#each formState.ingredients as ingredient, i}
			<IngredientRow {ingredient} {foods} onRemove={() => removeIngredient(i)} />
		{/each}
		<Button variant="outline" size="sm" type="button" onclick={addIngredient}>
			<Plus class="size-4" />
			{m.recipe_form_add_ingredient()}
		</Button>
	</div>
	{#if extendedNutrients}
		<div class="space-y-2">
			<Label class="text-sm font-medium">{m.recipe_form_nutrients()}</Label>
			<ExtendedNutrientsList nutrients={extendedNutrients} />
		</div>
	{/if}
	<Button class="w-full" type="submit" disabled={!canSave}>
		<Check class="size-4" />
		{saving ? m.detail_saving() : m.recipe_form_save()}
	</Button>
</form>
