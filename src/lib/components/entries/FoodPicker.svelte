<script lang="ts">
	import { onlyFavorites } from '$lib/utils/favorites';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import { api } from '$lib/api/client';
	import * as m from '$lib/paraglide/messages';
	import { dev } from '$app/environment';

	export type PickerFoodItem = {
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

	export type PickerRecipeItem = { id: string; name: string; isFavorite?: boolean };

	export type PickerSelection =
		| { type: 'food'; food: PickerFoodItem; lastServings?: number }
		| { type: 'recipe'; recipe: PickerRecipeItem }
		| {
				type: 'favorite';
				favorite: {
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
		  };

	type FavoriteItem = Extract<PickerSelection, { type: 'favorite' }>['favorite'];

	type Props = {
		foods?: PickerFoodItem[];
		recipes?: PickerRecipeItem[];
		tab: 'search' | 'favorites' | 'recent' | 'recipes';
		onSelect: (selection: PickerSelection) => void;
	};

	let { foods = [], recipes = [], tab, onSelect }: Props = $props();

	let query = $state('');
	let recentFoods: Array<{ id: string; name: string; lastServings?: number }> = $state([]);
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
				type: 'food',
				servingSize: f.servingSize,
				servingUnit: f.servingUnit
			})
		)
	);

	const allFavorites = $derived([...favoriteFoods, ...favoriteRecipes]);

	const loadRecentFoods = async () => {
		if (recentFoods.length > 0) return;
		loadingRecent = true;
		try {
			const { data } = await api.GET('/api/foods/recent');
			if (!data) return;
			recentFoods = data.foods ?? [];
		} catch (e) {
			if (dev) console.warn('Failed to load recent foods:', e);
		} finally {
			loadingRecent = false;
		}
	};

	const loadFavoriteRecipes = async () => {
		if (favoriteRecipes.length > 0) return;
		loadingFavorites = true;
		try {
			const { data } = await api.GET('/api/favorites', {
				params: { query: { type: 'recipes' } }
			});
			if (data) {
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
		} catch (e) {
			if (dev) console.warn('Failed to load favorite recipes:', e);
		} finally {
			loadingFavorites = false;
		}
	};

	$effect(() => {
		if (tab === 'recent') loadRecentFoods();
		if (tab === 'favorites') loadFavoriteRecipes();
	});
</script>

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
					onclick={() => onSelect({ type: 'food', food })}
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
						onclick={() => onSelect({ type: 'favorite', favorite: item })}
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
							onSelect({
								type: 'food',
								food: fullFood ?? { id: food.id, name: food.name },
								lastServings: food.lastServings
							});
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
					onclick={() => onSelect({ type: 'recipe', recipe })}
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
