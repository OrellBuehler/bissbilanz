<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import NumberInput from '$lib/components/shared/NumberInput.svelte';
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import Search from '@lucide/svelte/icons/search';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import BookCopy from '@lucide/svelte/icons/book-copy';
	import { db } from '$lib/db';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import type { DexieRecipe } from '$lib/db/types';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import { recipeScaleFactor, scaleIngredients } from '$lib/utils/recipe-scaling';
	import { formatKcal } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';

	const MAX_INGREDIENTS = 100;

	type Ingredient = { foodId: string; quantity: number; servingUnit: string };

	type Props = {
		open: boolean;
		existingCount: number;
		onAdd: (ingredients: Ingredient[]) => void;
	};

	let { open = $bindable(false), existingCount, onAdd }: Props = $props();

	const recipesQuery = useLiveQuery(() => recipeService.allRecipes());
	const recipes = $derived(recipesQuery.value ?? []);

	let query = $state('');
	let selected = $state<DexieRecipe | null>(null);
	let sourceIngredients = $state<Ingredient[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let amount = $state<number | null>(null);
	let mode = $state<'servings' | 'grams'>('servings');

	const visibleRecipes = $derived(
		recipes.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
	);

	const hasCookedWeight = $derived((selected?.cookedWeight ?? 0) > 0);

	const factor = $derived(
		selected && amount != null
			? recipeScaleFactor(
					{ totalServings: selected.totalServings, cookedWeight: selected.cookedWeight },
					amount,
					mode
				)
			: null
	);

	const previewKcal = $derived(
		factor != null && selected?.calories != null ? selected.calories * factor : null
	);

	const reset = () => {
		query = '';
		selected = null;
		sourceIngredients = [];
		loading = false;
		error = null;
		amount = null;
		mode = 'servings';
	};

	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) reset();
		wasOpen = open;
	});

	const loadIngredients = (id: string) =>
		db.recipeIngredients.where('recipeId').equals(id).sortBy('sortOrder');

	const pick = async (recipe: DexieRecipe) => {
		selected = recipe;
		amount = recipe.totalServings;
		mode = 'servings';
		error = null;
		sourceIngredients = [];
		loading = true;
		try {
			let rows = await loadIngredients(recipe.id);
			if (rows.length === 0) {
				await recipeService.refreshById(recipe.id);
				rows = await loadIngredients(recipe.id);
			}
			if (selected?.id !== recipe.id) return;
			if (rows.length === 0) {
				error = m.add_from_recipe_load_failed();
				return;
			}
			sourceIngredients = rows.map((i) => ({
				foodId: i.foodId,
				quantity: i.quantity,
				servingUnit: i.servingUnit
			}));
		} finally {
			if (selected?.id === recipe.id) loading = false;
		}
	};

	const back = () => {
		selected = null;
		error = null;
	};

	const confirm = () => {
		if (!selected || factor == null || sourceIngredients.length === 0) return;
		const total = existingCount + sourceIngredients.length;
		if (total > MAX_INGREDIENTS) {
			error = m.add_from_recipe_too_many({ max: String(MAX_INGREDIENTS), count: String(total) });
			return;
		}
		onAdd(scaleIngredients(sourceIngredients, factor));
		open = false;
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[85dvh] overflow-y-auto sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.add_from_recipe_title()}</Dialog.Title>
			<Dialog.Description>{m.add_from_recipe_description()}</Dialog.Description>
		</Dialog.Header>

		{#if !selected}
			<div class="relative">
				<Search class="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input placeholder={m.recipes_search_placeholder()} bind:value={query} class="pl-8" />
			</div>
			{#if recipes.length === 0}
				<p class="py-6 text-center text-sm text-muted-foreground">{m.recipes_no_recipes()}</p>
			{:else if visibleRecipes.length === 0}
				<p class="py-6 text-center text-sm text-muted-foreground">{m.recipes_no_results()}</p>
			{:else}
				<ul class="max-h-[50dvh] space-y-1 overflow-y-auto">
					{#each visibleRecipes as recipe (recipe.id)}
						<li>
							<button
								type="button"
								class="flex min-h-12 w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50"
								onclick={() => pick(recipe)}
							>
								<FoodThumbnail name={recipe.name} imageUrl={recipe.imageUrl} size="sm" />
								<span class="min-w-0 flex-1">
									<span class="block truncate font-medium">{recipe.name}</span>
									<span class="block text-xs text-muted-foreground">
										{m.recipes_servings({ count: recipe.totalServings })}
									</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<div class="space-y-4">
				<div class="flex items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={m.common_back()}
						onclick={back}
					>
						<ArrowLeft class="size-4" />
					</Button>
					<span class="min-w-0 flex-1 truncate font-medium">{selected.name}</span>
				</div>

				{#if hasCookedWeight}
					<ToggleGroup.Root
						type="single"
						variant="outline"
						class="w-full"
						value={mode}
						onValueChange={(value) => {
							if (!value) return;
							mode = value as 'servings' | 'grams';
							amount = mode === 'servings' ? selected!.totalServings : selected!.cookedWeight;
						}}
					>
						<ToggleGroup.Item value="servings" class="flex-1">
							{m.add_from_recipe_mode_servings()}
						</ToggleGroup.Item>
						<ToggleGroup.Item value="grams" class="flex-1">
							{m.add_from_recipe_mode_grams()}
						</ToggleGroup.Item>
					</ToggleGroup.Root>
				{/if}

				<div class="space-y-1.5">
					<Label for="add-from-recipe-amount">{m.add_from_recipe_amount()}</Label>
					<div class="flex items-center gap-3">
						<NumberInput id="add-from-recipe-amount" class="w-28" min="0" bind:value={amount} />
						<span class="text-sm text-muted-foreground">
							{mode === 'servings'
								? m.add_from_recipe_servings_hint({ count: String(selected.totalServings) })
								: m.add_from_recipe_grams_hint({ grams: String(selected.cookedWeight) })}
						</span>
					</div>
					{#if factor == null}
						<p class="text-xs text-destructive">{m.add_from_recipe_invalid_amount()}</p>
					{:else if previewKcal != null}
						<p class="text-sm font-medium text-blue-500">
							{m.add_from_recipe_preview({ kcal: formatKcal(previewKcal) })}
						</p>
					{/if}
				</div>

				{#if loading}
					<p class="text-sm text-muted-foreground">{m.add_from_recipe_loading()}</p>
				{/if}
				{#if error}
					<p class="text-sm text-destructive" role="alert">{error}</p>
				{/if}

				<Button
					type="button"
					class="w-full"
					disabled={loading || factor == null || sourceIngredients.length === 0}
					onclick={confirm}
				>
					<BookCopy class="size-4" />
					{m.add_from_recipe_confirm()}
				</Button>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
