<script lang="ts">
	import { onlyFavorites } from '$lib/utils/favorites';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

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

	const handleTabChange = (value: string) => {
		tab = value as typeof tab;
		if (value === 'recent') {
			loadRecentFoods();
		}
	};
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && onClose()}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Add Food</Dialog.Title>
		</Dialog.Header>

		<Tabs.Root value={tab} onValueChange={handleTabChange}>
			<Tabs.List class="grid w-full grid-cols-4">
				<Tabs.Trigger value="search">Search</Tabs.Trigger>
				<Tabs.Trigger value="favorites">Favorites</Tabs.Trigger>
				<Tabs.Trigger value="recent">Recent</Tabs.Trigger>
				<Tabs.Trigger value="recipes">Recipes</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="search" class="space-y-4">
				<Input placeholder="Search foods..." bind:value={query} />
				<ul class="max-h-60 space-y-2 overflow-auto">
					{#each filtered() as food}
						<li class="flex items-center justify-between">
							<span>{food.name}</span>
							<Button variant="outline" size="sm" onclick={() => handleAddFood(food.id)}>
								Add
							</Button>
						</li>
					{/each}
				</ul>
			</Tabs.Content>

			<Tabs.Content value="favorites" class="space-y-4">
				<ul class="max-h-60 space-y-2 overflow-auto">
					{#each onlyFavorites(foods) as food}
						<li class="flex items-center justify-between">
							<span>{food.name}</span>
							<Button variant="outline" size="sm" onclick={() => handleAddFood(food.id)}>
								Add
							</Button>
						</li>
					{:else}
						<li class="text-muted-foreground">No favorites yet</li>
					{/each}
				</ul>
			</Tabs.Content>

			<Tabs.Content value="recent" class="space-y-4">
				{#if loadingRecent}
					<p class="text-muted-foreground">Loading...</p>
				{:else}
					<ul class="max-h-60 space-y-2 overflow-auto">
						{#each recentFoods as food}
							<li class="flex items-center justify-between">
								<span>{food.name}</span>
								<Button variant="outline" size="sm" onclick={() => handleAddFood(food.id)}>
									Add
								</Button>
							</li>
						{:else}
							<li class="text-muted-foreground">No recent foods</li>
						{/each}
					</ul>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="recipes" class="space-y-4">
				<Input placeholder="Search recipes..." bind:value={query} />
				<ul class="max-h-60 space-y-2 overflow-auto">
					{#each filteredRecipes() as recipe}
						<li class="flex items-center justify-between">
							<span>{recipe.name}</span>
							<Button variant="outline" size="sm" onclick={() => handleAddRecipe(recipe.id)}>
								Add
							</Button>
						</li>
					{:else}
						<li class="text-muted-foreground">No recipes yet</li>
					{/each}
				</ul>
			</Tabs.Content>
		</Tabs.Root>

		<div class="grid gap-2">
			<Label for="servings">Servings</Label>
			<Input id="servings" type="number" bind:value={servings} min="0.1" step="0.1" />
		</div>
	</Dialog.Content>
</Dialog.Root>
