<script lang="ts">
	import { onlyFavorites } from '$lib/utils/favorites';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import * as m from '$lib/paraglide/messages';

	type FavoriteItem = {
		id: string;
		name: string;
		imageUrl: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		type: 'food' | 'recipe';
	};

	type Props = {
		open?: boolean;
		foods?: Array<{
			id: string;
			name: string;
			isFavorite?: boolean;
			calories?: number;
			protein?: number;
			carbs?: number;
			fat?: number;
			imageUrl?: string | null;
		}>;
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
				type: 'food'
			})
		)
	);

	const allFavorites = $derived([...favoriteFoods, ...favoriteRecipes]);

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

	const handleFavoriteTap = (item: FavoriteItem) => {
		if (item.type === 'food') {
			handleAddFood(item.id);
		} else {
			handleAddRecipe(item.id);
		}
	};
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && onClose()}>
	<Dialog.Content class="max-w-lg overflow-hidden">
		<Dialog.Header>
			<Dialog.Title>{m.add_food_title()}</Dialog.Title>
		</Dialog.Header>

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
								onclick={() => handleAddFood(food.id)}
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
									onclick={() => handleFavoriteTap(item)}
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
									onclick={() => handleAddFood(food.id)}
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
								onclick={() => handleAddRecipe(recipe.id)}
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

		<div class="grid gap-2">
			<Label for="servings">{m.add_food_servings()}</Label>
			<Input id="servings" type="number" bind:value={servings} min="0.1" step="0.1" />
		</div>
	</Dialog.Content>
</Dialog.Root>
