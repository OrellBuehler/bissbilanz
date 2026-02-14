<script lang="ts">
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages';

	let foods: Array<{ id: string; name: string; servingUnit?: string }> = [];
	let recipes: Array<{ id: string; name: string; totalServings: number }> = [];
	let showForm = false;

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
		showForm = false;
		await loadRecipes();
	};

	const deleteRecipe = async (id: string) => {
		await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
		await loadRecipes();
	};

	loadFoods();
	loadRecipes();
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<div class="flex items-center justify-between">
		{#if !showForm}
			<Button onclick={() => (showForm = true)}>{m.recipes_new()}</Button>
		{/if}
	</div>

	{#if showForm}
		<RecipeForm {foods} onSave={createRecipe} onCancel={() => (showForm = false)} />
	{/if}

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
