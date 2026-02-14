<script lang="ts">
	import { onMount } from 'svelte';
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import * as m from '$lib/paraglide/messages';

	let foods: Array<{ id: string; name: string; servingUnit?: string }> = $state([]);
	let recipes: Array<{ id: string; name: string; totalServings: number }> = $state([]);
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

	const deleteRecipe = async (id: string) => {
		await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
		await loadRecipes();
	};

	onMount(() => {
		loadFoods();
		loadRecipes();
	});
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
	<ul class="space-y-2">
		{#each recipes as recipe}
			<Card.Root class="flex items-center justify-between p-3">
				<div>
					<span class="font-medium">{recipe.name}</span>
					<span class="text-sm text-muted-foreground">{m.recipes_servings({ count: recipe.totalServings })}</span>
				</div>
				<Button variant="destructive" size="sm" onclick={() => deleteRecipe(recipe.id)}>
					{m.foods_delete()}
				</Button>
			</Card.Root>
		{:else}
			<li class="text-muted-foreground">{m.recipes_no_recipes()}</li>
		{/each}
	</ul>
</div>

<!-- New recipe modal -->
<ResponsiveModal bind:open={showNewRecipe} title={m.recipes_new()} description={m.recipes_new_description()}>
	<RecipeForm {foods} onSave={createRecipe} />
</ResponsiveModal>
