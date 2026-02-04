<script lang="ts">
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';

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

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold">Recipes</h1>
		{#if !showForm}
			<button class="rounded bg-black px-4 py-2 text-white" onclick={() => (showForm = true)}>
				New Recipe
			</button>
		{/if}
	</div>

	{#if showForm}
		<RecipeForm {foods} onSave={createRecipe} onCancel={() => (showForm = false)} />
	{/if}

	<ul class="space-y-2">
		{#each recipes as recipe}
			<li class="flex items-center justify-between rounded border p-3">
				<div>
					<span class="font-medium">{recipe.name}</span>
					<span class="text-sm text-neutral-500">({recipe.totalServings} servings)</span>
				</div>
				<button
					class="rounded border px-3 py-1 text-red-500"
					onclick={() => deleteRecipe(recipe.id)}
				>
					Delete
				</button>
			</li>
		{:else}
			<li class="text-neutral-500">No recipes yet</li>
		{/each}
	</ul>
</div>
