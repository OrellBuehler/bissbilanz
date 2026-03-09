<script lang="ts">
	import { onlyFavorites } from '$lib/utils/favorites';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import AmountInput from '$lib/components/entries/AmountInput.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import { Label } from '$lib/components/ui/label/index.js';
	import { apiFetch } from '$lib/utils/api';
	import { timeToIsoString } from '$lib/utils/dates';
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
		date: string;
		onClose: () => void;
		onSave: (payload: {
			foodId?: string;
			recipeId?: string;
			mealType: string;
			servings: number;
			eatenAt?: string;
			quickName?: string;
			quickCalories?: number;
			quickProtein?: number;
			quickCarbs?: number;
			quickFat?: number;
			quickFiber?: number;
		}) => void;
	};

	let {
		open = $bindable(false),
		foods = [],
		recipes = [],
		mealType = 'Breakfast',
		date,
		onClose,
		onSave
	}: Props = $props();

	let query = $state('');
	let servings = $state(1);
	let eatenTime = $state('');
	let tab: 'search' | 'favorites' | 'recent' | 'recipes' | 'quick' = $state('search');
	let recentFoods: Array<{ id: string; name: string }> = $state([]);

	let quickName = $state('');
	let quickCalories = $state('');
	let quickProtein = $state('');
	let quickCarbs = $state('');
	let quickFat = $state('');
	let quickFiber = $state('');
	let quickMacrosOpen = $state(false);

	let macroCalories = $derived(
		(Number(quickProtein) || 0) * 4 +
		(Number(quickCarbs) || 0) * 4 +
		(Number(quickFat) || 0) * 9
	);
	let hasMacros = $derived((!!quickProtein || !!quickCarbs || !!quickFat) && !!quickCalories);
	let macrosMatch = $derived(Math.round(macroCalories) === Math.round(Number(quickCalories) || 0));
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

	let wasOpen = $state(false);
	$effect(() => {
		if (wasOpen && !open) {
			onClose();
		}
		wasOpen = open;
	});

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
		const eatenAt = timeToIsoString(eatenTime, date) ?? undefined;
		const base = { mealType, servings, eatenAt };
		if (selectedFood.type === 'food') {
			onSave({ foodId: selectedFood.id, ...base });
		} else {
			onSave({ recipeId: selectedFood.id, ...base });
		}
		selectedFood = null;
		eatenTime = '';
	};

	const confirmQuickLog = () => {
		const cal = Number(quickCalories);
		if (!cal || cal < 0) return;
		onSave({
			mealType,
			servings: 1,
			eatenAt: timeToIsoString(eatenTime, date) ?? undefined,
			quickName: quickName.trim() || undefined,
			quickCalories: cal,
			quickProtein: quickProtein ? Number(quickProtein) : undefined,
			quickCarbs: quickCarbs ? Number(quickCarbs) : undefined,
			quickFat: quickFat ? Number(quickFat) : undefined,
			quickFiber: quickFiber ? Number(quickFiber) : undefined
		});
		quickName = '';
		quickCalories = '';
		quickProtein = '';
		quickCarbs = '';
		quickFat = '';
		quickFiber = '';
		eatenTime = '';
	};

	const goBack = () => {
		selectedFood = null;
	};

	const loadRecentFoods = async () => {
		if (recentFoods.length > 0) return;
		loadingRecent = true;
		try {
			const res = await apiFetch('/api/foods/recent');
			if (!res.ok) return;
			const data = await res.json();
			recentFoods = data.foods ?? [];
		} catch {
			// Silently ignore — recent foods unavailable offline
		} finally {
			loadingRecent = false;
		}
	};

	const loadFavoriteRecipes = async () => {
		if (favoriteRecipes.length > 0) return;
		loadingFavorites = true;
		try {
			const res = await apiFetch('/api/favorites?type=recipes');
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

<ResponsiveModal bind:open title={m.add_food_title()}>
	<div class="min-w-0 space-y-4">
		{#if selectedFood}
			<div class="space-y-4">
				<div class="flex min-w-0 items-center gap-2">
					<Button variant="ghost" size="icon" onclick={goBack} class="shrink-0 size-8">
						<ArrowLeft class="size-4" />
					</Button>
					<span class="min-w-0 truncate text-sm font-medium">{selectedFood.name}</span>
				</div>

				<AmountInput
					{servings}
					servingSize={selectedFood.servingSize}
					servingUnit={selectedFood.servingUnit}
					caloriesPerServing={selectedFood.calories}
					onServingsChange={(v) => (servings = v)}
				/>

				<div class="grid gap-1.5">
					<Label class="text-xs">{m.add_food_time()}</Label>
					<Input type="time" bind:value={eatenTime} />
				</div>

				<Button class="w-full" onclick={confirmAdd}>
					<Check class="mr-1 size-4" />
					{m.add_food_add()}
				</Button>
			</div>
		{:else}
			<Tabs.Root value={tab} onValueChange={handleTabChange}>
				<Tabs.List class="grid h-auto w-full grid-cols-3 gap-1 sm:h-9 sm:grid-cols-5">
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
					<Tabs.Trigger value="quick" class="text-xs sm:text-sm"
						>{m.add_food_tab_quick()}</Tabs.Trigger
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

				<Tabs.Content value="quick" class="space-y-4">
					<div class="grid gap-3">
						<Input placeholder={m.quick_log_name_placeholder()} bind:value={quickName} />
						<div class="grid gap-1.5">
							<Label>{m.quick_log_calories()}</Label>
							<Input type="number" inputmode="decimal" min="0" bind:value={quickCalories} />
						</div>
						<button
							type="button"
							class="flex items-center gap-1 text-sm text-muted-foreground"
							onclick={() => (quickMacrosOpen = !quickMacrosOpen)}
						>
							{#if quickMacrosOpen}
								<ChevronUp class="size-4" />
							{:else}
								<ChevronDown class="size-4" />
							{/if}
							{m.quick_log_macros()}
						</button>
						{#if quickMacrosOpen}
							<div class="grid grid-cols-2 gap-3">
								<div class="grid gap-1.5">
									<Label class="text-xs">{m.quick_log_protein()}</Label>
									<Input
										type="number"
										inputmode="decimal"
										min="0"
										bind:value={quickProtein}
									/>
								</div>
								<div class="grid gap-1.5">
									<Label class="text-xs">{m.quick_log_carbs()}</Label>
									<Input
										type="number"
										inputmode="decimal"
										min="0"
										bind:value={quickCarbs}
									/>
								</div>
								<div class="grid gap-1.5">
									<Label class="text-xs">{m.quick_log_fat()}</Label>
									<Input type="number" inputmode="decimal" min="0" bind:value={quickFat} />
								</div>
								<div class="grid gap-1.5">
									<Label class="text-xs">{m.quick_log_fiber()}</Label>
									<Input
										type="number"
										inputmode="decimal"
										min="0"
										bind:value={quickFiber}
									/>
								</div>
							</div>
							{#if hasMacros}
								<div class="flex items-center gap-1.5 text-xs {macrosMatch ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}">
									{#if macrosMatch}
										<CircleCheck class="size-3.5" />
									{:else}
										<TriangleAlert class="size-3.5" />
									{/if}
									{m.quick_log_macro_calories({ calories: Math.round(macroCalories) })}
								</div>
							{/if}
						{/if}
						<div class="grid gap-1.5">
							<Label class="text-xs">{m.add_food_time()}</Label>
							<Input type="time" bind:value={eatenTime} />
						</div>
						<Button class="w-full" disabled={!quickCalories || Number(quickCalories) <= 0} onclick={confirmQuickLog}>
							<Check class="mr-1 size-4" />
							{m.quick_log_add()}
						</Button>
					</div>
				</Tabs.Content>
			</Tabs.Root>
		{/if}
	</div>
</ResponsiveModal>
