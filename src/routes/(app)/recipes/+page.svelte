<script lang="ts">
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';
	import RecipeEditForm from '$lib/components/recipes/RecipeEditForm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import ForceDeleteDialog from '$lib/components/ui/force-delete-dialog.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import { api } from '$lib/api/client';
	import type { components } from '$lib/api/generated/schema';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import { removeImage, uploadImage, uploadImageFile } from '$lib/utils/image-upload';
	import type { buildRecipePayload } from '$lib/utils/recipe-builder';
	import { browser } from '$app/environment';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import { foodService } from '$lib/services/food-service.svelte';
	import { consumeQuickAction } from '$lib/stores/command-palette.svelte';
	import HintCard from '$lib/components/help/HintCard.svelte';
	import { isDismissed } from '$lib/stores/hints.svelte';

	let foods: Array<{ id: string; name: string; servingUnit?: string }> = $state([]);
	let showForm = $state(false);
	let editingRecipe = $state<components['schemas']['RecipeDetail'] | null>(null);
	let formImageUrl: string | null = $state(null);
	let uploading = $state(false);
	let forceDeleteId: string | null = $state(null);
	let forceDeleteCount = $state(0);

	const recipesQuery = useLiveQuery(() => recipeService.allRecipes());
	const recipes = $derived(recipesQuery.value ?? []);

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
		showForm = true;
	});

	const loadFoods = async () => {
		const { data } = await api.GET('/api/foods');
		if (data) foods = data.foods;
	};

	const createRecipe = async (payload: ReturnType<typeof buildRecipePayload>) => {
		await api.POST('/api/recipes', {
			body: formImageUrl ? { ...payload, imageUrl: formImageUrl } : payload
		});
		closeForm();
		recipeService.refresh();
	};

	const updateRecipe = async (payload: {
		name: string;
		totalServings: number;
		isFavorite: boolean;
		imageUrl: string | null;
	}) => {
		if (!editingRecipe) return;
		const { error } = await api.PATCH('/api/recipes/{id}', {
			params: { path: { id: editingRecipe.id } },
			body: payload
		});
		if (!error) {
			toast.success(m.detail_saved());
		} else {
			toast.error(m.detail_save_failed());
		}
		closeForm();
		recipeService.refresh();
	};

	const deleteRecipe = async (id: string) => {
		const { error, response } = await api.DELETE('/api/recipes/{id}', {
			params: { path: { id } }
		});
		if (response.status === 409 && error) {
			forceDeleteId = id;
			forceDeleteCount = (error as { entryCount?: number }).entryCount ?? 0;
			return;
		}
		recipeService.refresh();
	};

	const confirmForceDelete = async () => {
		if (!forceDeleteId) return;
		await api.DELETE('/api/recipes/{id}', {
			params: { path: { id: forceDeleteId }, query: { force: true } }
		});
		forceDeleteId = null;
		recipeService.refresh();
	};

	const openEdit = async (id: string) => {
		const { data, error } = await api.GET('/api/recipes/{id}', {
			params: { path: { id } }
		});
		if (error || !data) return;
		editingRecipe = data.recipe;
		formImageUrl = data.recipe.imageUrl;
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
	};

	const fmt = (n: number) => Math.round(n);
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

	{#if recipes.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.recipes_no_recipes()}</p>
	{:else}
		<div class="space-y-2">
			{#each recipes as recipe}
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
						</div>
						<DeleteButton onDelete={() => deleteRecipe(recipe.id)} title={m.recipes_delete()} />
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
	{#if editingRecipe}
		{#key editingRecipe.id}
			<RecipeEditForm
				recipe={editingRecipe}
				imageUrl={formImageUrl}
				{uploading}
				onSave={updateRecipe}
				onImageUpload={handleImageUpload}
				onImageRemove={handleImageRemove}
			/>
		{/key}
	{:else}
		<RecipeForm
			{foods}
			imageUrl={formImageUrl}
			{uploading}
			onSave={createRecipe}
			onImageUpload={handleImageUpload}
			onImageRemove={handleImageRemove}
		/>
	{/if}
</ResponsiveModal>

<ForceDeleteDialog
	open={forceDeleteId !== null}
	count={forceDeleteCount}
	description={m.recipes_delete_has_entries({ count: forceDeleteCount })}
	onConfirm={confirmForceDelete}
	onCancel={() => (forceDeleteId = null)}
/>
