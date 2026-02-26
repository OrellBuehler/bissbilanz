<script lang="ts">
	import { onMount } from 'svelte';
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';
	import RecipeEditForm from '$lib/components/recipes/RecipeEditForm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { apiFetch } from '$lib/utils/api';
	import { toast } from 'svelte-sonner';
	import * as Sentry from '@sentry/sveltekit';
	import * as m from '$lib/paraglide/messages';

	type Recipe = {
		id: string;
		name: string;
		totalServings: number;
		isFavorite: boolean;
		imageUrl: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
	};

	let foods: Array<{ id: string; name: string; servingUnit?: string }> = $state([]);
	let recipes: Recipe[] = $state([]);
	let showForm = $state(false);
	let editingRecipe: any | null = $state(null);
	let editImageUrl: string | null = $state(null);

	const loadFoods = async () => {
		const res = await fetch('/api/foods');
		foods = (await res.json()).foods;
	};

	const loadRecipes = async () => {
		const res = await fetch('/api/recipes');
		recipes = (await res.json()).recipes;
	};

	const createRecipe = async (payload: any) => {
		await apiFetch('/api/recipes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		closeForm();
		await loadRecipes();
	};

	const updateRecipe = async (payload: {
		name: string;
		totalServings: number;
		isFavorite: boolean;
		imageUrl: string | null;
	}) => {
		if (!editingRecipe) return;
		const res = await apiFetch(`/api/recipes/${editingRecipe.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (res.ok) {
			toast.success(m.detail_saved());
		} else {
			toast.error(m.detail_save_failed());
		}
		closeForm();
		await loadRecipes();
	};

	const deleteRecipe = async (e: Event, id: string) => {
		e.stopPropagation();
		await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' });
		await loadRecipes();
	};

	const openEdit = async (id: string) => {
		const res = await fetch(`/api/recipes/${id}`);
		if (!res.ok) return;
		const data = await res.json();
		editingRecipe = data.recipe;
		editImageUrl = data.recipe.imageUrl;
		showForm = true;
	};

	const handleImageUpload = async (file: File) => {
		if (!editingRecipe) return;
		const formData = new FormData();
		formData.append('image', file);
		try {
			const uploadRes = await fetch('/api/images/upload', {
				method: 'POST',
				body: formData
			});
			if (!uploadRes.ok) {
				const body = await uploadRes.text().catch(() => '');
				Sentry.captureMessage('Image upload failed', {
					level: 'error',
					extra: { status: uploadRes.status, body, fileSize: file.size, fileType: file.type }
				});
				toast.error(m.image_upload_failed());
				return;
			}
			const { imageUrl: newUrl } = await uploadRes.json();
			editImageUrl = newUrl;
			await apiFetch(`/api/recipes/${editingRecipe.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ imageUrl: newUrl })
			});
		} catch (err) {
			Sentry.captureException(err, { extra: { fileSize: file.size, fileType: file.type } });
			toast.error(m.image_upload_failed());
		}
	};

	const closeForm = () => {
		showForm = false;
		editingRecipe = null;
		editImageUrl = null;
	};

	onMount(() => {
		loadFoods();
		loadRecipes();
	});

	const fmt = (n: number) => Math.round(n);
</script>

<div class="mx-auto max-w-2xl space-y-4 pb-4">
	{#if recipes.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.recipes_no_recipes()}</p>
	{:else}
		<div class="space-y-2">
			{#each recipes as recipe}
				<Card.Root
					class="cursor-pointer transition-colors hover:bg-accent/50"
					onclick={() => openEdit(recipe.id)}
				>
					<Card.Content class="flex items-start justify-between gap-2 p-4">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<span class="truncate font-medium">{recipe.name}</span>
								<span class="shrink-0 text-xs text-muted-foreground">
									{m.recipes_servings({ count: recipe.totalServings })}
								</span>
							</div>
							<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
								<span class="font-medium text-blue-500">{fmt(recipe.calories)} kcal</span>
								<span class="text-red-500">{fmt(recipe.protein)}g P</span>
								<span class="text-orange-500">{fmt(recipe.carbs)}g C</span>
								<span class="text-yellow-600">{fmt(recipe.fat)}g F</span>
							</div>
						</div>
						<Button
							variant="ghost"
							size="icon"
							class="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
							onclick={(e) => deleteRecipe(e, recipe.id)}
						>
							<Trash2 class="size-4" />
						</Button>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<Button
	size="icon"
	class="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg"
	aria-label={m.recipes_new()}
	onclick={() => {
		editingRecipe = null;
		editImageUrl = null;
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
				imageUrl={editImageUrl}
				onSave={updateRecipe}
				onImageUpload={handleImageUpload}
			/>
		{/key}
	{:else}
		<RecipeForm {foods} onSave={createRecipe} />
	{/if}
</ResponsiveModal>
