<script lang="ts">
	import { onlyFavorites } from '$lib/utils/favorites';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import AmountInput from '$lib/components/entries/AmountInput.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import * as m from '$lib/paraglide/messages';

	type FoodItem = {
		id: string;
		name: string;
		isFavorite?: boolean;
		calories?: number;
		protein?: number;
		carbs?: number;
		fat?: number;
		imageUrl?: string | null;
		servingSize?: number | null;
		servingUnit?: string | null;
	};

	type FavoriteItem = {
		id: string;
		name: string;
		imageUrl: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		type: 'food' | 'recipe';
		servingSize?: number | null;
		servingUnit?: string | null;
	};

	type Props = {
		open?: boolean;
		foods?: FoodItem[];
		recipes?: Array<{ id: string; name: string; isFavorite?: boolean }>;
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
	let favoriteRecipes: FavoriteItem[] = $state([]);
	let loadingFavorites = $state(false);
	let selectedFood: {
		id: string;
		name: string;
		type: 'food' | 'recipe';
		servingSize?: number | null;
		servingUnit?: string | null;
		calories?: number | null;
	} | null = $state(null);

	const filtered = () =>
		foods.filter((food) => food.name.toLowerCase().includes(query.toLowerCase()));

	const filteredRecipes = () =>
		recipes.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));

	const favoriteFoods = $derived(
		onlyFavorites(foods).map(
			(f): FavoriteItem => ({
				id: f.id,
				name: f.name,
				imageUrl: f.imageUrl ?? null,
				calories: f.calories ?? 0,
				protein: f.protein ?? 0,
				carbs: f.carbs ?? 0,
				fat: f.fat ?? 0,
				type: 'food',
				servingSize: f.servingSize,
				servingUnit: f.servingUnit
			})
		)
	);

	const allFavorites = $derived([...favoriteFoods, ...favoriteRecipes]);

	const selectFood = (food: {
		id: string;
		name: string;
		servingSize?: number | null;
		servingUnit?: string | null;
		calories?: number;
	}) => {
		selectedFood = {
			id: food.id,
			name: food.name,
			type: 'food',
			servingSize: food.servingSize,
			servingUnit: food.servingUnit,
			calories: food.calories
		};
		servings = 1;
	};

	const selectRecipe = (recipe: { id: string; name: string }) => {
		selectedFood = { id: recipe.id, name: recipe.name, type: 'recipe' };
		servings = 1;
	};

	const selectFavorite = (item: FavoriteItem) => {
		selectedFood = {
			id: item.id,
			name: item.name,
			type: item.type,
			servingSize: item.servingSize,
			servingUnit: item.servingUnit,
			calories: item.calories
		};
		servings = 1;
	};

	const confirmAdd = () => {
		if (!selectedFood) return;
		if (selectedFood.type === 'food') {
			onSave({ foodId: selectedFood.id, mealType, servings });
		} else {
			onSave({ recipeId: selectedFood.id, mealType, servings });
		}
		selectedFood = null;
	};

	const goBack = () => {
		selectedFood = null;
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

	const loadFavoriteRecipes = async () => {
		if (favoriteRecipes.length > 0) return;
		loadingFavorites = true;
		try {
			const res = await fetch('/api/favorites?type=recipes');
			if (res.ok) {
				const data = await res.json();
				favoriteRecipes = (data.recipes ?? []).map(
					(r: any): FavoriteItem => ({
						id: r.id,
						name: r.name,
						imageUrl: r.imageUrl ?? null,
						calories: r.calories ?? 0,
						protein: r.protein ?? 0,
						carbs: r.carbs ?? 0,
						fat: r.fat ?? 0,
						type: 'recipe'
					})
				);
			}
		} catch {
			// silently ignore
		} finally {
			loadingFavorites = false;
		}
	};

	const handleTabChange = (value: string) => {
		tab = value as typeof tab;
		if (value === 'recent') {
			loadRecentFoods();
		}
		if (value === 'favorites') {
			loadFavoriteRecipes();
		}
	};
</script>

<Dialog.Root
	bind:open
	onOpenChange={(o) => {
		if (!o) {
			onClose();
			selectedFood = null;
		}
	}}
>
	<Dialog.Content class="max-w-lg overflow-hidden">
		<Dialog.Header>
			<Dialog.Title>{m.add_food_title()}</Dialog.Title>
		</Dialog.Header>

		{#if selectedFood}
			<div class="space-y-4">
				<div class="flex items-center gap-2">
					<Button variant="ghost" size="icon" onclick={goBack} class="shrink-0 size-8">
						<ArrowLeft class="size-4" />
					</Button>
					<span class="text-sm font-medium">{selectedFood.name}</span>
				</div>

				<AmountInput
					{servings}
					servingSize={selectedFood.servingSize}
					servingUnit={selectedFood.servingUnit}
					caloriesPerServing={selectedFood.calories}
					onServingsChange={(v) => (servings = v)}
				/>

				<Button class="w-full" onclick={confirmAdd}>
					<Check class="mr-1 size-4" />
					{m.add_food_add()}
				</Button>
			</div>
		{:else}
			<Tabs.Root value={tab} onValueChange={handleTabChange}>
				<Tabs.List class="grid h-auto w-full grid-cols-2 gap-1 sm:h-9 sm:grid-cols-4">
					<Tabs.Trigger value="search" class="text-xs sm:text-sm"
						>{m.add_food_tab_search()}</Tabs.Trigger
					>
					<Tabs.Trigger value="favorites" class="text-xs sm:text-sm"
						>{m.add_food_tab_favorites()}</Tabs.Trigger
					>
					<Tabs.Trigger value="recent" class="text-xs sm:text-sm"
						>{m.add_food_tab_recent()}</Tabs.Trigger
					>
					<Tabs.Trigger value="recipes" class="text-xs sm:text-sm"
						>{m.add_food_tab_recipes()}</Tabs.Trigger
					>
				</Tabs.List>

				<Tabs.Content value="search" class="space-y-4">
					<Input placeholder={m.add_food_search_placeholder()} bind:value={query} />
					<ul class="max-h-60 space-y-2 overflow-auto">
						{#each filtered() as food}
							<li class="flex min-w-0 items-start justify-between gap-2">
								<span class="min-w-0 flex-1 truncate text-sm">{food.name}</span>
								<Button
									variant="outline"
									size="sm"
									class="shrink-0"
									aria-label={m.add_food_add()}
									onclick={() => selectFood(food)}
								>
									<Plus class="size-4 sm:mr-1" />
									<span class="hidden sm:inline">{m.add_food_add()}</span>
								</Button>
							</li>
						{/each}
					</ul>
				</Tabs.Content>

				<Tabs.Content value="favorites" class="space-y-4">
					{#if loadingFavorites}
						<p class="text-muted-foreground">{m.add_food_loading()}</p>
					{:else}
						<ul class="max-h-60 space-y-2 overflow-auto">
							{#each allFavorites as item (item.id)}
								<li class="flex min-w-0 items-start justify-between gap-2">
									<span class="min-w-0 flex-1 truncate text-sm">{item.name}</span>
									<Button
										variant="outline"
										size="sm"
										class="shrink-0"
										aria-label={m.add_food_add()}
										onclick={() => selectFavorite(item)}
									>
										<Plus class="size-4 sm:mr-1" />
										<span class="hidden sm:inline">{m.add_food_add()}</span>
									</Button>
								</li>
							{:else}
								<li class="text-muted-foreground">{m.add_food_no_favorites()}</li>
							{/each}
						</ul>
					{/if}
				</Tabs.Content>

				<Tabs.Content value="recent" class="space-y-4">
					{#if loadingRecent}
						<p class="text-muted-foreground">{m.add_food_loading()}</p>
					{:else}
						<ul class="max-h-60 space-y-2 overflow-auto">
							{#each recentFoods as food}
								<li class="flex min-w-0 items-start justify-between gap-2">
									<span class="min-w-0 flex-1 truncate text-sm">{food.name}</span>
									<Button
										variant="outline"
										size="sm"
										class="shrink-0"
										aria-label={m.add_food_add()}
										onclick={() => {
											const fullFood = foods.find((f) => f.id === food.id);
											if (fullFood) {
												selectFood(fullFood);
											} else {
												selectFood({ id: food.id, name: food.name });
											}
										}}
									>
										<Plus class="size-4 sm:mr-1" />
										<span class="hidden sm:inline">{m.add_food_add()}</span>
									</Button>
								</li>
							{:else}
								<li class="text-muted-foreground">{m.add_food_no_recent()}</li>
							{/each}
						</ul>
					{/if}
				</Tabs.Content>

				<Tabs.Content value="recipes" class="space-y-4">
					<Input placeholder={m.add_food_search_recipes_placeholder()} bind:value={query} />
					<ul class="max-h-60 space-y-2 overflow-auto">
						{#each filteredRecipes() as recipe}
							<li class="flex min-w-0 items-start justify-between gap-2">
								<span class="min-w-0 flex-1 truncate text-sm">{recipe.name}</span>
								<Button
									variant="outline"
									size="sm"
									class="shrink-0"
									aria-label={m.add_food_add()}
									onclick={() => selectRecipe(recipe)}
								>
									<Plus class="size-4 sm:mr-1" />
									<span class="hidden sm:inline">{m.add_food_add()}</span>
								</Button>
							</li>
						{:else}
							<li class="text-muted-foreground">{m.add_food_no_recipes()}</li>
						{/each}
					</ul>
				</Tabs.Content>
			</Tabs.Root>
		{/if}
	</Dialog.Content>
</Dialog.Root>
