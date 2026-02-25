<script lang="ts">
	import FavoriteMealPicker from '$lib/components/favorites/FavoriteMealPicker.svelte';
	import FavoriteCard from '$lib/components/favorites/FavoriteCard.svelte';
	import FavoritesGrid from '$lib/components/favorites/FavoritesGrid.svelte';
	import ServingsPicker from '$lib/components/favorites/ServingsPicker.svelte';
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { DEFAULT_MEAL_TYPES, mergeMealTypes, resolveMealTypeForMinute } from '$lib/utils/meals';
	import { today } from '$lib/utils/dates';
	import { apiFetch } from '$lib/utils/api';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import Star from '@lucide/svelte/icons/star';
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

	type Props = {
		onEntryLogged: () => void;
		favoriteTapAction?: 'instant' | 'picker';
		favoriteMealAssignmentMode?: 'time_based' | 'ask_meal';
		favoriteMealTimeframes?: Array<{
			mealType: string;
			startMinute: number;
			endMinute: number;
		}>;
	};

	let {
		onEntryLogged,
		favoriteTapAction = 'instant',
		favoriteMealAssignmentMode = 'time_based',
		favoriteMealTimeframes = []
	}: Props = $props();

	let items: FavoriteItem[] = $state([]);
	let pickerOpen = $state(false);
	let pickerItem: FavoriteItem | null = $state(null);
	let mealPickerOpen = $state(false);
	let mealOptions: string[] = $state([...DEFAULT_MEAL_TYPES]);
	let pendingLog: { item: FavoriteItem; servings: number } | null = $state(null);

	const loadFavorites = async () => {
		try {
			const res = await fetch('/api/favorites?limit=5');
			if (!res.ok) return;
			const data = await res.json();
			const allItems: FavoriteItem[] = [...(data.foods ?? []), ...(data.recipes ?? [])];
			allItems.sort((a, b) => b.logCount - a.logCount);
			items = allItems.slice(0, 5);
		} catch {
			// silently ignore
		}
	};

	const loadMealOptions = async () => {
		try {
			const res = await fetch('/api/meal-types');
			if (!res.ok) return;
			const data = await res.json();
			mealOptions = mergeMealTypes(
				[...DEFAULT_MEAL_TYPES],
				(data.mealTypes ?? []).map((meal: { name: string }) => meal.name)
			);
		} catch {
			mealOptions = [...DEFAULT_MEAL_TYPES];
		}
	};

	const getConfiguredMeal = (): string | null => {
		if (favoriteMealAssignmentMode === 'ask_meal') return null;
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
							onEntryLogged();
						}
					}
				: undefined,
			duration: 5000
		});

		onEntryLogged();
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
		if (favoriteTapAction === 'picker') {
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
		loadFavorites();
		loadMealOptions();
	});
</script>

{#if items.length > 0}
	<DashboardCard title={m.favorites_title()} Icon={Star} tone="rose">
		<FavoritesGrid>
			{#each items as item (item.id)}
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
	</DashboardCard>
{/if}

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
