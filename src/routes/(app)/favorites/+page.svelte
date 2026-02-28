<script lang="ts">
	import FavoriteMealPicker from '$lib/components/favorites/FavoriteMealPicker.svelte';
	import FavoriteCard from '$lib/components/favorites/FavoriteCard.svelte';
	import FavoritesGrid from '$lib/components/favorites/FavoritesGrid.svelte';
	import ServingsPicker from '$lib/components/favorites/ServingsPicker.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { DEFAULT_MEAL_TYPES, mergeMealTypes, resolveMealTypeForMinute } from '$lib/utils/meals';
	import { today } from '$lib/utils/dates';
	import { apiFetch } from '$lib/utils/api';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import Heart from '@lucide/svelte/icons/heart';
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
		logCount: number;
	};

	let foods: FavoriteItem[] = $state([]);
	let recipes: FavoriteItem[] = $state([]);
	let loading = $state(true);
	let tapAction: 'instant' | 'picker' = $state('instant');
	let mealAssignmentMode: 'time_based' | 'ask_meal' = $state('time_based');
	let favoriteMealTimeframes: Array<{ mealType: string; startMinute: number; endMinute: number }> =
		$state([]);
	let mealOptions: string[] = $state([...DEFAULT_MEAL_TYPES]);

	let pickerOpen = $state(false);
	let pickerItem: FavoriteItem | null = $state(null);
	let mealPickerOpen = $state(false);
	let pendingLog: { item: FavoriteItem; servings: number } | null = $state(null);

	const loadData = async () => {
		try {
			const [favRes, prefRes, mealTypesRes] = await Promise.all([
				apiFetch('/api/favorites'),
				apiFetch('/api/preferences'),
				apiFetch('/api/meal-types')
			]);
			if (favRes.ok) {
				const data = await favRes.json();
				foods = data.foods ?? [];
				recipes = data.recipes ?? [];
			}
			if (prefRes.ok) {
				const prefData = await prefRes.json();
				tapAction = prefData.preferences?.favoriteTapAction ?? 'instant';
				mealAssignmentMode = prefData.preferences?.favoriteMealAssignmentMode ?? 'time_based';
				favoriteMealTimeframes = prefData.preferences?.favoriteMealTimeframes ?? [];
			}
			if (mealTypesRes.ok) {
				const mealTypeData = await mealTypesRes.json();
				mealOptions = mergeMealTypes(
					[...DEFAULT_MEAL_TYPES],
					(mealTypeData.mealTypes ?? []).map((meal: { name: string }) => meal.name)
				);
			}
		} catch {
			// silently ignore load failures
		} finally {
			loading = false;
		}
	};

	const getConfiguredMeal = (): string | null => {
		if (mealAssignmentMode === 'ask_meal') return null;
		const now = new Date();
		const minuteOfDay = now.getHours() * 60 + now.getMinutes();
		return resolveMealTypeForMinute(minuteOfDay, favoriteMealTimeframes) ?? null;
	};

	const logEntry = async (item: FavoriteItem, servings = 1, mealType?: string) => {
		const meal = mealType;
		if (!meal) return;
		const payload: Record<string, unknown> = {
			mealType: meal,
			servings,
			date: today()
		};
		if (item.type === 'food') {
			payload.foodId = item.id;
		} else {
			payload.recipeId = item.id;
		}

		const res = await apiFetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!res.ok) return;

		const data = await res.json();

		toast.info(m.favorites_logged_toast({ name: item.name, meal }), {
			action: data.entry
				? {
						label: m.favorites_undo(),
						onClick: async () => {
							await apiFetch(`/api/entries/${data.entry.id}`, { method: 'DELETE' });
							await loadData();
						}
					}
				: undefined,
			duration: 5000
		});
	};

	const continuePendingLog = () => {
		if (!pendingLog) return;
		const resolvedMeal = getConfiguredMeal();
		if (resolvedMeal) {
			void logEntry(pendingLog.item, pendingLog.servings, resolvedMeal);
			pendingLog = null;
			return;
		}
		mealPickerOpen = true;
	};

	const handleTap = (item: FavoriteItem) => {
		pendingLog = { item, servings: 1 };
		if (tapAction === 'picker') {
			pickerItem = item;
			pickerOpen = true;
			return;
		}

		continuePendingLog();
	};

	const handlePickerConfirm = (servings: number) => {
		if (pendingLog) {
			pendingLog = { ...pendingLog, servings };
		}
		pickerOpen = false;
		pickerItem = null;
		continuePendingLog();
	};

	const handleMealConfirm = (mealType: string) => {
		if (pendingLog) {
			void logEntry(pendingLog.item, pendingLog.servings, mealType);
		}
		mealPickerOpen = false;
		pendingLog = null;
	};

	onMount(() => {
		loadData();
	});
</script>

<div class="mx-auto max-w-4xl space-y-4">
	{#if loading}
		<p class="text-muted-foreground">{m.favorites_loading()}</p>
	{:else}
		<Tabs.Root value="foods">
			<Tabs.List class="w-full">
				<Tabs.Trigger value="foods">{m.favorites_foods_tab()}</Tabs.Trigger>
				<Tabs.Trigger value="recipes">{m.favorites_recipes_tab()}</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="foods" class="mt-4">
				{#if foods.length === 0}
					<div class="flex flex-col items-center gap-4 py-12 text-center">
						<Heart class="size-16 text-muted-foreground/40" />
						<p class="text-muted-foreground">{m.favorites_empty()}</p>
						<Button variant="outline" href="/foods">{m.favorites_browse_foods()}</Button>
					</div>
				{:else}
					<FavoritesGrid>
						{#each foods as item (item.id)}
							<FavoriteCard
								name={item.name}
								imageUrl={item.imageUrl}
								calories={item.calories}
								protein={item.protein}
								carbs={item.carbs}
								fat={item.fat}
								type={item.type}
								onTap={() => handleTap(item)}
							/>
						{/each}
					</FavoritesGrid>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="recipes" class="mt-4">
				{#if recipes.length === 0}
					<div class="flex flex-col items-center gap-4 py-12 text-center">
						<Heart class="size-16 text-muted-foreground/40" />
						<p class="text-muted-foreground">{m.favorites_empty_recipes()}</p>
						<Button variant="outline" href="/recipes">{m.favorites_browse_recipes()}</Button>
					</div>
				{:else}
					<FavoritesGrid>
						{#each recipes as item (item.id)}
							<FavoriteCard
								name={item.name}
								imageUrl={item.imageUrl}
								calories={item.calories}
								protein={item.protein}
								carbs={item.carbs}
								fat={item.fat}
								type={item.type}
								onTap={() => handleTap(item)}
							/>
						{/each}
					</FavoritesGrid>
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</div>

<ServingsPicker
	bind:open={pickerOpen}
	itemName={pickerItem?.name ?? ''}
	onConfirm={handlePickerConfirm}
	onClose={() => {
		pickerOpen = false;
		pickerItem = null;
		pendingLog = null;
	}}
/>

<FavoriteMealPicker
	bind:open={mealPickerOpen}
	itemName={pendingLog?.item.name ?? ''}
	{mealOptions}
	onConfirm={handleMealConfirm}
	onClose={() => {
		mealPickerOpen = false;
		pendingLog = null;
	}}
/>
