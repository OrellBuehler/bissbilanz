<script lang="ts">
	import { onlyFavorites } from '$lib/utils/favorites';

	type Props = {
		open?: boolean;
		foods?: Array<{ id: string; name: string; isFavorite?: boolean }>;
		recipes?: Array<{ id: string; name: string }>;
		mealType?: string;
		onClose: () => void;
		onSave: (payload: {
			foodId?: string;
			recipeId?: string;
			mealType: string;
			servings: number;
		}) => void;
	};

	let {
		open = false,
		foods = [],
		recipes = [],
		mealType = 'Breakfast',
		onClose,
		onSave
	}: Props = $props();

	let query = $state('');
	let servings = $state(1);
	let tab: 'search' | 'favorites' | 'recent' | 'recipes' = $state('search');
	let recentFoods: Array<{ id: string; name: string }> = $state([]);
	let loadingRecent = $state(false);

	const filtered = () =>
		foods.filter((food) => food.name.toLowerCase().includes(query.toLowerCase()));

	const filteredRecipes = () =>
		recipes.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));

	const handleAddFood = (foodId: string) => {
		onSave({ foodId, mealType, servings });
	};

	const handleAddRecipe = (recipeId: string) => {
		onSave({ recipeId, mealType, servings });
	};

	const loadRecentFoods = async () => {
		if (recentFoods.length > 0) return;
		loadingRecent = true;
		try {
			const res = await fetch('/api/foods/recent');
			const data = await res.json();
			recentFoods = data.foods;
		} finally {
			loadingRecent = false;
		}
	};

	const selectTab = (newTab: 'search' | 'favorites' | 'recent' | 'recipes') => {
		tab = newTab;
		if (newTab === 'recent') {
			loadRecentFoods();
		}
	};
</script>

{#if open}
	<div class="fixed inset-0 z-50 bg-black/40 p-6">
		<div class="mx-auto max-w-lg space-y-4 rounded bg-white p-6">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold">Add Food</h3>
				<button onclick={onClose}>Close</button>
			</div>

			<div class="flex flex-wrap gap-2">
				<button
					class="rounded border px-3 py-1"
					class:bg-black={tab === 'search'}
					class:text-white={tab === 'search'}
					onclick={() => selectTab('search')}
				>
					Search
				</button>
				<button
					class="rounded border px-3 py-1"
					class:bg-black={tab === 'favorites'}
					class:text-white={tab === 'favorites'}
					onclick={() => selectTab('favorites')}
				>
					Favorites
				</button>
				<button
					class="rounded border px-3 py-1"
					class:bg-black={tab === 'recent'}
					class:text-white={tab === 'recent'}
					onclick={() => selectTab('recent')}
				>
					Recent
				</button>
				<button
					class="rounded border px-3 py-1"
					class:bg-black={tab === 'recipes'}
					class:text-white={tab === 'recipes'}
					onclick={() => selectTab('recipes')}
				>
					Recipes
				</button>
			</div>

			{#if tab === 'search'}
				<input
					class="w-full rounded border p-2"
					placeholder="Search foods..."
					bind:value={query}
				/>
				<ul class="max-h-60 space-y-2 overflow-auto">
					{#each filtered() as food}
						<li class="flex items-center justify-between">
							<span>{food.name}</span>
							<button class="rounded border px-2 py-1" onclick={() => handleAddFood(food.id)}>
								Add
							</button>
						</li>
					{/each}
				</ul>
			{:else if tab === 'favorites'}
				<ul class="max-h-60 space-y-2 overflow-auto">
					{#each onlyFavorites(foods) as food}
						<li class="flex items-center justify-between">
							<span>{food.name}</span>
							<button class="rounded border px-2 py-1" onclick={() => handleAddFood(food.id)}>
								Add
							</button>
						</li>
					{:else}
						<li class="text-neutral-500">No favorites yet</li>
					{/each}
				</ul>
			{:else if tab === 'recent'}
				{#if loadingRecent}
					<p class="text-neutral-500">Loading...</p>
				{:else}
					<ul class="max-h-60 space-y-2 overflow-auto">
						{#each recentFoods as food}
							<li class="flex items-center justify-between">
								<span>{food.name}</span>
								<button class="rounded border px-2 py-1" onclick={() => handleAddFood(food.id)}>
									Add
								</button>
							</li>
						{:else}
							<li class="text-neutral-500">No recent foods</li>
						{/each}
					</ul>
				{/if}
			{:else if tab === 'recipes'}
				<input
					class="w-full rounded border p-2"
					placeholder="Search recipes..."
					bind:value={query}
				/>
				<ul class="max-h-60 space-y-2 overflow-auto">
					{#each filteredRecipes() as recipe}
						<li class="flex items-center justify-between">
							<span>{recipe.name}</span>
							<button class="rounded border px-2 py-1" onclick={() => handleAddRecipe(recipe.id)}>
								Add
							</button>
						</li>
					{:else}
						<li class="text-neutral-500">No recipes yet</li>
					{/each}
				</ul>
			{/if}

			<label class="grid gap-2">
				<span>Servings</span>
				<input
					class="rounded border p-2"
					type="number"
					bind:value={servings}
					min="0.1"
					step="0.1"
				/>
			</label>
		</div>
	</div>
{/if}
