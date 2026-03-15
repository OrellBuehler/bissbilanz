<script lang="ts">
	import { onMount } from 'svelte';
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';
	import RecipeEditForm from '$lib/components/recipes/RecipeEditForm.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Plus from '@lucide/svelte/icons/plus';
	import { apiFetch } from '$lib/utils/api';
	import { api } from '$lib/api/client';
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
	let forceDeleteId: string | null = $state(null);
	let forceDeleteCount = $state(0);

	const loadFoods = async () => {
		const { data } = await api.GET('/api/foods');
		if (data) foods = data.foods;
	};

	const loadRecipes = async () => {
		const { data } = await api.GET('/api/recipes');
		if (data) recipes = data.recipes;
	};

	const createRecipe = async (payload: any) => {
		await api.POST('/api/recipes', { body: payload });
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
		await loadRecipes();
	};

	const deleteRecipe = async (id: string) => {
		const { error, response } = await api.DELETE('/api/recipes/{id}', {
			params: { path: { id } }
		});
		if (response.status === 409 && error) {
			forceDeleteId = id;
			forceDeleteCount = (error as any).entryCount ?? 0;
			return;
		}
		await loadRecipes();
	};

	const confirmForceDelete = async () => {
		if (!forceDeleteId) return;
		await apiFetch(`/api/recipes/${forceDeleteId}?force=true`, { method: 'DELETE' });
		forceDeleteId = null;
		await loadRecipes();
	};

	const openEdit = async (id: string) => {
		const { data, error } = await api.GET('/api/recipes/{id}', {
			params: { path: { id } }
		});
		if (error || !data) return;
		editingRecipe = data.recipe;
		editImageUrl = data.recipe.imageUrl;
		showForm = true;
	};

	const handleImageUpload = async (file: File) => {
		if (!editingRecipe) return;
		const formData = new FormData();
		formData.append('image', file);
		try {
			const uploadRes = await apiFetch('/api/images/upload', {
				method: 'POST',
				body: formData
			});
			if (!uploadRes.ok) {
				const body = await uploadRes.text().catch(() => '');
				Sentry.logger.error('Image upload failed', {
					status: uploadRes.status,
					body: body.slice(0, 500),
					fileSize: file.size,
					fileType: file.type,
					context: 'recipe-edit'
				});
				toast.error(m.image_upload_failed());
				return;
			}
			const { imageUrl: newUrl } = await uploadRes.json();
			editImageUrl = newUrl;
			await api.PATCH('/api/recipes/{id}', {
				params: { path: { id: editingRecipe.id } },
				body: { imageUrl: newUrl }
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
						<DeleteButton
							onDelete={() => deleteRecipe(recipe.id)}
							title={m.recipes_delete()}
							class="mt-0.5"
						/>
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

<AlertDialog.Root
	open={forceDeleteId !== null}
	onOpenChange={(open) => {
		if (!open) forceDeleteId = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title class="text-left">{m.delete_related_entries()}</AlertDialog.Title>
			<AlertDialog.Description>
				{@html m.recipes_delete_has_entries({ count: forceDeleteCount })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => (forceDeleteId = null)}>
				{m.cancel()}
			</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={confirmForceDelete}
			>
				<Trash2 class="size-4" />
				{m.delete_related_entries()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
