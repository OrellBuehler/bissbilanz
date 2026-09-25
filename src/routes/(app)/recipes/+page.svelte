<script lang="ts">
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import ForceDeleteDialog from '$lib/components/ui/force-delete-dialog.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Star from '@lucide/svelte/icons/star';
	import CirclePlus from '@lucide/svelte/icons/circle-plus';
	import Copy from '@lucide/svelte/icons/copy';
	import { api } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import { removeImage, uploadImage, uploadImageFile } from '$lib/utils/image-upload';
	import type { RecipeFormPayload } from '$lib/components/recipes/RecipeForm.svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { db } from '$lib/db';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import { requestQuickAction, consumeQuickAction } from '$lib/stores/command-palette.svelte';
	import { caloriesPerHundredGrams } from '$lib/utils/recipe-yield';
	import HintCard from '$lib/components/help/HintCard.svelte';
	import { isDismissed } from '$lib/stores/hints.svelte';

	type EditingRecipe = {
		id: string;
		name: string;
		totalServings: number;
		isFavorite: boolean;
		imageUrl: string | null;
		cookedWeight: number | null;
		calories: number | null;
		ingredients: Array<{ foodId: string; quantity: number; servingUnit: string }>;
	};

	let foods: Array<{ id: string; name: string; servingUnit?: string }> = $state([]);
	let showForm = $state(false);
	let editingRecipe = $state<EditingRecipe | null>(null);
	let formImageUrl: string | null = $state(null);
	let uploading = $state(false);
	let forceDeleteId: string | null = $state(null);
	let forceDeleteCount = $state(0);
	let editingExtendedNutrients: Record<string, number | null> | null = $state(null);

	let query = $state('');
	let sortBy = $state<'name' | 'recent' | 'calories'>('name');

	const recipesQuery = useLiveQuery(() => recipeService.allRecipes());
	const recipes = $derived(recipesQuery.value ?? []);

	const perServingCalories = (r: (typeof recipes)[number]) =>
		(r.calories ?? 0) / (r.totalServings > 0 ? r.totalServings : 1);

	const visibleRecipes = $derived(
		[...recipes]
			.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
			.sort((a, b) => {
				if (sortBy === 'calories') return perServingCalories(a) - perServingCalories(b);
				if (sortBy === 'recent') {
					const aTime = a.updatedAt ?? a.createdAt ?? '';
					const bTime = b.updatedAt ?? b.createdAt ?? '';
					return bTime.localeCompare(aTime);
				}
				return a.name.localeCompare(b.name);
			})
	);

	$effect(() => {
		if (browser) {
			recipeService.refresh();
			loadFoods();
		}
	});

	// "New recipe" from the command palette.
	$effect(() => {
		if (!consumeQuickAction(['new-recipe'])) return;
		editingRecipe = null;
		formImageUrl = null;
		editingExtendedNutrients = null;
		showForm = true;
	});

	const loadFoods = async () => {
		const { data } = await api.GET('/api/foods');
		if (data) foods = data.foods;
	};

	const createRecipe = async (payload: RecipeFormPayload) => {
		const body = formImageUrl ? { ...payload, imageUrl: formImageUrl } : payload;
		const result = await recipeService.create(body);
		if (result.status === 'failed') {
			toast.error(m.detail_save_failed());
			return;
		}
		closeForm();
	};

	const updateRecipe = async (payload: RecipeFormPayload) => {
		if (!editingRecipe) return;
		const result = await recipeService.update(editingRecipe.id, payload);
		if (result.status === 'failed') {
			toast.error(m.detail_save_failed());
			return;
		}
		toast.success(m.detail_saved());
		closeForm();
	};

	const deleteRecipe = async (id: string) => {
		const result = await recipeService.delete(id);
		if (result.status === 'blocked') {
			forceDeleteId = id;
			forceDeleteCount = result.entryCount;
		}
	};

	const confirmForceDelete = async () => {
		if (!forceDeleteId) return;
		await recipeService.delete(forceDeleteId, { force: true });
		forceDeleteId = null;
	};

	const toggleFavorite = async (recipe: (typeof recipes)[number]) => {
		await recipeService.update(recipe.id, { isFavorite: !recipe.isFavorite });
	};

	const duplicateRecipe = async (recipe: (typeof recipes)[number]) => {
		const result = await recipeService.duplicate(
			recipe.id,
			m.recipe_copy_name({ name: recipe.name })
		);
		if (result.status === 'failed') {
			toast.error(m.detail_save_failed());
			return;
		}
		await openEdit(result.id);
	};

	const logRecipe = (recipeId: string) => {
		requestQuickAction({ type: 'add-food', recipeId });
		goto('/home');
	};

	const openEdit = async (id: string) => {
		// Best-effort refresh so an edit starts from the latest server copy;
		// offline (or a failed fetch) falls back to whatever is cached.
		const fresh = await recipeService.refreshById(id);
		editingExtendedNutrients = fresh?.extendedNutrientsPerServing ?? null;
		const recipe = await db.recipes.get(id);
		if (!recipe) return;
		const ingredients = await db.recipeIngredients.where('recipeId').equals(id).sortBy('sortOrder');
		editingRecipe = {
			id: recipe.id,
			name: recipe.name,
			totalServings: recipe.totalServings,
			isFavorite: recipe.isFavorite,
			imageUrl: recipe.imageUrl,
			cookedWeight: recipe.cookedWeight,
			calories: recipe.calories,
			ingredients: ingredients.map((i) => ({
				foodId: i.foodId,
				quantity: i.quantity,
				servingUnit: i.servingUnit
			}))
		};
		formImageUrl = recipe.imageUrl;
		showForm = true;
	};

	const handleImageUpload = async (file: File) => {
		if (uploading) return;
		uploading = true;
		try {
			// Creating: there is no row to attach to yet, so the URL rides along in
			// the create body instead of a PATCH.
			const newUrl = editingRecipe
				? await uploadImage(file, { type: 'recipe', id: editingRecipe.id })
				: await uploadImageFile(file, 'recipe-create');
			if (newUrl) formImageUrl = newUrl;
		} finally {
			uploading = false;
		}
	};

	const handleImageRemove = async () => {
		if (uploading) return;
		// Creating: nothing is attached yet, so dropping the pending URL is enough.
		if (!editingRecipe) {
			formImageUrl = null;
			return;
		}
		uploading = true;
		try {
			if (await removeImage({ type: 'recipe', id: editingRecipe.id })) formImageUrl = null;
		} finally {
			uploading = false;
		}
	};

	const closeForm = () => {
		showForm = false;
		editingRecipe = null;
		formImageUrl = null;
		editingExtendedNutrients = null;
	};

	const fmt = (n: number) => Math.round(n);

	const cookedWeightSubtitle = (r: (typeof recipes)[number]) => {
		if (!r.cookedWeight) return null;
		const per100g = caloriesPerHundredGrams(r.calories ?? 0, r.cookedWeight);
		return m.recipes_cooked_weight_subtitle({
			grams: String(Math.round(r.cookedWeight)),
			kcal: String(Math.round(per100g ?? 0))
		});
	};
</script>

<div class="mx-auto max-w-2xl space-y-4 pb-4">
	{#if !isDismissed('recipes')}
		<HintCard
			id="recipes"
			title={m.hint_recipes_title()}
			text={m.hint_recipes_body()}
			href="/help/recipes"
		/>
	{/if}

	{#if recipes.length > 0}
		<div class="flex gap-2">
			<div class="relative flex-1">
				<Search class="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input placeholder={m.recipes_search_placeholder()} bind:value={query} class="pl-8" />
			</div>
			<Select.Root
				type="single"
				value={sortBy}
				onValueChange={(v) => v && (sortBy = v as typeof sortBy)}
			>
				<Select.Trigger class="w-40 shrink-0">
					{sortBy === 'recent'
						? m.recipes_sort_recent()
						: sortBy === 'calories'
							? m.recipes_sort_calories()
							: m.recipes_sort_name()}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="name">{m.recipes_sort_name()}</Select.Item>
					<Select.Item value="recent">{m.recipes_sort_recent()}</Select.Item>
					<Select.Item value="calories">{m.recipes_sort_calories()}</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
	{/if}

	{#if recipes.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.recipes_no_recipes()}</p>
	{:else if visibleRecipes.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.recipes_no_results()}</p>
	{:else}
		<div class="space-y-2">
			{#each visibleRecipes as recipe (recipe.id)}
				<Card.Root
					class="cursor-pointer transition-colors hover:bg-accent/50"
					onclick={() => openEdit(recipe.id)}
				>
					<Card.Content class="flex items-center justify-between gap-3 p-4">
						<FoodThumbnail name={recipe.name} imageUrl={recipe.imageUrl} size="md" />
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<span class="truncate font-medium">{recipe.name}</span>
								<span class="shrink-0 text-xs text-muted-foreground">
									{m.recipes_servings({ count: recipe.totalServings })}
								</span>
							</div>
							<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
								<span class="font-medium text-blue-500">{fmt(recipe.calories ?? 0)} kcal</span>
								<span class="text-red-500">{fmt(recipe.protein ?? 0)}g P</span>
								<span class="text-orange-500">{fmt(recipe.carbs ?? 0)}g C</span>
								<span class="text-yellow-600">{fmt(recipe.fat ?? 0)}g F</span>
							</div>
							{#if cookedWeightSubtitle(recipe)}
								<p class="mt-1 text-xs text-muted-foreground">{cookedWeightSubtitle(recipe)}</p>
							{/if}
						</div>
						<div class="flex shrink-0 items-center">
							<Button
								variant="ghost"
								size="icon"
								aria-label={recipe.isFavorite ? m.foods_bulk_unfavorite() : m.foods_bulk_favorite()}
								onclick={(e) => {
									e.stopPropagation();
									toggleFavorite(recipe);
								}}
							>
								<Star
									class={recipe.isFavorite
										? 'size-4 fill-yellow-400 text-yellow-400'
										: 'size-4 text-muted-foreground'}
								/>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.favorites_log()}
								onclick={(e) => {
									e.stopPropagation();
									logRecipe(recipe.id);
								}}
							>
								<CirclePlus class="size-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.recipes_duplicate()}
								onclick={(e) => {
									e.stopPropagation();
									duplicateRecipe(recipe);
								}}
							>
								<Copy class="size-4" />
							</Button>
							<DeleteButton onDelete={() => deleteRecipe(recipe.id)} title={m.recipes_delete()} />
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<Button
	size="icon"
	class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-50 size-14 rounded-full shadow-lg md:bottom-6"
	aria-label={m.recipes_new()}
	onclick={() => {
		editingRecipe = null;
		formImageUrl = null;
		editingExtendedNutrients = null;
		showForm = true;
	}}
>
	<Plus class="size-6" />
</Button>

<ResponsiveModal
	bind:open={showForm}
	title={editingRecipe ? editingRecipe.name : m.recipes_new()}
	description={editingRecipe ? undefined : m.recipes_new_description()}
>
	{#key editingRecipe?.id ?? 'new'}
		<RecipeForm
			{foods}
			recipe={editingRecipe}
			imageUrl={formImageUrl}
			{uploading}
			extendedNutrients={editingExtendedNutrients}
			onSave={editingRecipe ? updateRecipe : createRecipe}
			onImageUpload={handleImageUpload}
			onImageRemove={handleImageRemove}
		/>
	{/key}
</ResponsiveModal>

<ForceDeleteDialog
	open={forceDeleteId !== null}
	count={forceDeleteCount}
	description={m.recipes_delete_has_entries({ count: forceDeleteCount })}
	onConfirm={confirmForceDelete}
	onCancel={() => (forceDeleteId = null)}
/>
