<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
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
	let showNewRecipe = $state(false);

	const loadFoods = async () => {
		const res = await fetch('/api/foods');
		foods = (await res.json()).foods;
	};

	const loadRecipes = async () => {
		const res = await fetch('/api/recipes');
		recipes = (await res.json()).recipes;
	};

	const createRecipe = async (payload: any) => {
		await fetch('/api/recipes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		showNewRecipe = false;
		await loadRecipes();
	};

	const deleteRecipe = async (e: Event, id: string) => {
		e.stopPropagation();
		await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
		await loadRecipes();
	};

	onMount(() => {
		loadFoods();
		loadRecipes();
	});

	const fmt = (n: number) => Math.round(n);
</script>

<div class="mx-auto max-w-2xl space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">{m.recipes_title()}</h1>
		<Button size="sm" onclick={() => (showNewRecipe = true)}>
			<Plus class="mr-1.5 size-4" />
			{m.recipes_new()}
		</Button>
	</div>

	<!-- Recipe list -->
	{#if recipes.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.recipes_no_recipes()}</p>
	{:else}
		<div class="space-y-2">
			{#each recipes as recipe}
				<Card.Root
					class="cursor-pointer transition-colors hover:bg-accent/50"
					onclick={() => goto(`/app/recipes/${recipe.id}`)}
				>
					<Card.Content class="flex items-center justify-between p-4">
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-2">
								<span class="truncate font-medium">{recipe.name}</span>
								<span class="shrink-0 text-xs text-muted-foreground">
									{m.recipes_servings({ count: recipe.totalServings })}
								</span>
							</div>
							<div class="mt-1 flex gap-3 text-xs">
								<span class="font-medium text-blue-500">{fmt(recipe.calories)} kcal</span>
								<span class="text-red-500">{fmt(recipe.protein)}g P</span>
								<span class="text-orange-500">{fmt(recipe.carbs)}g C</span>
								<span class="text-yellow-600">{fmt(recipe.fat)}g F</span>
							</div>
						</div>
						<Button
							variant="ghost"
							size="icon"
							class="shrink-0 text-muted-foreground hover:text-destructive"
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

<!-- New recipe modal -->
<ResponsiveModal bind:open={showNewRecipe} title={m.recipes_new()} description={m.recipes_new_description()}>
	<RecipeForm {foods} onSave={createRecipe} />
</ResponsiveModal>
