<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import { liveQuery } from 'dexie';
	import { goto } from '$app/navigation';
	import * as Command from '$lib/components/ui/command/index.js';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { foodService } from '$lib/services/food-service.svelte';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import { getNavItems } from '$lib/config/navigation';
	import { commandPalette, requestQuickAction } from '$lib/stores/command-palette.svelte';
	import { parseDateQuery, rankByQuery } from '$lib/utils/command-palette';
	import { filterFoods } from '$lib/components/foods/foodFilters';
	import { formatDateLabel, yesterday } from '$lib/utils/dates';
	import { api } from '$lib/api/client';
	import type { DexieFood, DexieRecipe } from '$lib/db/types';
	import { dev } from '$app/environment';
	import * as m from '$lib/paraglide/messages';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import Heart from '@lucide/svelte/icons/heart';
	import Plus from '@lucide/svelte/icons/plus';
	import ScanBarcode from '@lucide/svelte/icons/scan-barcode';
	import Utensils from '@lucide/svelte/icons/utensils';

	const MAX_FOODS = 8;
	const MAX_RECIPES = 5;
	const MAX_FAVORITES = 5;

	let query = $state('');
	let recentFoods = $state<Array<{ id: string; name: string }>>([]);
	let recentLoaded = false;

	const noFoods = () => liveQuery(async (): Promise<DexieFood[]> => []);
	const noRecipes = () => liveQuery(async (): Promise<DexieRecipe[]> => []);

	const foodsQuery = useLiveQuery<DexieFood[]>(
		() => (commandPalette.open ? foodService.allFoods() : noFoods()),
		[]
	);
	const recipesQuery = useLiveQuery<DexieRecipe[]>(
		() => (commandPalette.open ? recipeService.allRecipes() : noRecipes()),
		[]
	);

	const foods = $derived(foodsQuery.value);
	const recipes = $derived(recipesQuery.value);

	const loadRecentFoods = async () => {
		try {
			const { data } = await api.GET('/api/foods/recent');
			recentFoods = (data?.foods ?? []).map((f) => ({ id: f.id, name: f.name }));
		} catch (e) {
			if (dev) console.warn('Failed to load recent foods:', e);
		}
	};

	$effect(() => {
		if (!commandPalette.open) return;
		if (!recentLoaded) {
			recentLoaded = true;
			loadRecentFoods();
		}
		foodService.refresh();
		recipeService.refresh();
	});

	$effect(() => {
		if (!commandPalette.open) query = '';
	});

	const close = () => {
		commandPalette.open = false;
		query = '';
	};

	const openPage = async (href: string) => {
		close();
		await goto(href);
	};

	const logFood = async (foodId: string) => {
		close();
		requestQuickAction({ type: 'add-food', foodId });
		await goto('/home');
	};

	const logRecipe = async (recipeId: string) => {
		close();
		requestQuickAction({ type: 'add-food', recipeId });
		await goto('/home');
	};

	type ActionItem = { id: string; label: string; icon: Component; run: () => void };

	const actions = $derived<ActionItem[]>([
		{
			id: 'log-food',
			label: m.command_action_log_food(),
			icon: Plus,
			run: async () => {
				close();
				requestQuickAction({ type: 'add-food' });
				await goto('/home');
			}
		},
		{
			id: 'scan',
			label: m.command_action_scan(),
			icon: ScanBarcode,
			run: async () => {
				close();
				requestQuickAction({ type: 'scan' });
				await goto('/home');
			}
		},
		{
			id: 'new-food',
			label: m.command_action_new_food(),
			icon: Utensils,
			run: async () => {
				close();
				requestQuickAction({ type: 'new-food' });
				await goto('/foods');
			}
		},
		{
			id: 'new-recipe',
			label: m.command_action_new_recipe(),
			icon: CookingPot,
			run: async () => {
				close();
				requestQuickAction({ type: 'new-recipe' });
				await goto('/recipes');
			}
		},
		{
			id: 'go-today',
			label: m.command_action_today(),
			icon: CalendarDays,
			run: () => openPage('/home')
		},
		{
			id: 'go-yesterday',
			label: m.command_action_yesterday(),
			icon: CalendarDays,
			run: () => openPage(`/home?date=${yesterday()}`)
		}
	]);

	const pages = $derived(rankByQuery(getNavItems(), query, (item) => item.title()));
	const matchedActions = $derived(rankByQuery(actions, query, (action) => action.label));
	const parsedDate = $derived(parseDateQuery(query));

	const matchedFoods = $derived(
		query.trim()
			? filterFoods(foods, query).slice(0, MAX_FOODS)
			: recentFoods.slice(0, MAX_FOODS).map((f) => ({ id: f.id, name: f.name }))
	);
	const matchedRecipes = $derived(
		query.trim() ? rankByQuery(recipes, query, (r) => r.name).slice(0, MAX_RECIPES) : []
	);
	const favorites = $derived(
		query.trim()
			? []
			: [
					...foods.filter((f) => f.isFavorite).map((f) => ({ id: f.id, name: f.name, food: true })),
					...recipes
						.filter((r) => r.isFavorite)
						.map((r) => ({ id: r.id, name: r.name, food: false }))
				].slice(0, MAX_FAVORITES)
	);

	const resultCount = $derived(
		pages.length +
			matchedActions.length +
			(parsedDate ? 1 : 0) +
			matchedFoods.length +
			matchedRecipes.length +
			favorites.length
	);

	onMount(() => {
		const onKeydown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
			event.preventDefault();
			commandPalette.toggle();
		};
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

<Command.Dialog
	bind:open={commandPalette.open}
	shouldFilter={false}
	loop
	title={m.command_palette_title()}
	description={m.command_palette_description()}
>
	<Command.Input placeholder={m.command_placeholder()} bind:value={query} />
	<Command.List>
		{#if resultCount === 0}
			<Command.Empty forceMount>{m.command_empty()}</Command.Empty>
		{/if}

		{#if pages.length}
			<Command.Group heading={m.command_group_pages()}>
				{#each pages as item (item.href)}
					{@const Icon = item.icon}
					<Command.Item value={`page:${item.href}`} onSelect={() => openPage(item.href)}>
						<Icon />
						<span class="truncate">{item.title()}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}

		{#if matchedActions.length || parsedDate}
			<Command.Group heading={m.command_group_actions()}>
				{#if parsedDate}
					<Command.Item
						value="action:go-to-date"
						onSelect={() => openPage(`/home?date=${parsedDate}`)}
					>
						<CalendarDays />
						<span class="truncate"
							>{m.command_action_go_to_date({ date: formatDateLabel(parsedDate) })}</span
						>
					</Command.Item>
				{/if}
				{#each matchedActions as action (action.id)}
					{@const Icon = action.icon}
					<Command.Item value={`action:${action.id}`} onSelect={action.run}>
						<Icon />
						<span class="truncate">{action.label}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}

		{#if matchedFoods.length}
			<Command.Group heading={query.trim() ? m.command_group_foods() : m.command_group_recent()}>
				{#each matchedFoods as food (food.id)}
					<Command.Item value={`food:${food.id}`} onSelect={() => logFood(food.id)}>
						<Utensils />
						<span class="truncate">{food.name}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}

		{#if matchedRecipes.length}
			<Command.Group heading={m.command_group_recipes()}>
				{#each matchedRecipes as recipe (recipe.id)}
					<Command.Item value={`recipe:${recipe.id}`} onSelect={() => logRecipe(recipe.id)}>
						<CookingPot />
						<span class="truncate">{recipe.name}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}

		{#if favorites.length}
			<Command.Group heading={m.command_group_favorites()}>
				{#each favorites as favorite (favorite.id)}
					<Command.Item
						value={`favorite:${favorite.id}`}
						onSelect={() => (favorite.food ? logFood(favorite.id) : logRecipe(favorite.id))}
					>
						<Heart />
						<span class="truncate">{favorite.name}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Dialog>
