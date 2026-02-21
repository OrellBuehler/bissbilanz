<script lang="ts">
	import FavoriteCard from '$lib/components/favorites/FavoriteCard.svelte';
	import FavoritesGrid from '$lib/components/favorites/FavoritesGrid.svelte';
	import ServingsPicker from '$lib/components/favorites/ServingsPicker.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { getCurrentMealByTime } from '$lib/utils/meals';
	import { today } from '$lib/utils/dates';
	import { apiFetch } from '$lib/utils/api';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
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
	};

	let { onEntryLogged, favoriteTapAction = 'instant' }: Props = $props();

	let items: FavoriteItem[] = $state([]);
	let pickerOpen = $state(false);
	let pickerItem: FavoriteItem | null = $state(null);

	const loadFavorites = async () => {
		try {
			const res = await fetch('/api/favorites?limit=5');
			if (!res.ok) return;
			const data = await res.json();
			const allItems: FavoriteItem[] = [
				...(data.foods ?? []),
				...(data.recipes ?? [])
			];
			allItems.sort((a, b) => b.logCount - a.logCount);
			items = allItems.slice(0, 5);
		} catch {
			// silently ignore
		}
	};

	const logEntry = async (item: FavoriteItem, servings = 1) => {
		const meal = getCurrentMealByTime();
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

	const handleTap = (item: FavoriteItem) => {
		if (favoriteTapAction === 'picker') {
			pickerItem = item;
			pickerOpen = true;
		} else {
			logEntry(item);
		}
	};

	const handlePickerConfirm = (servings: number) => {
		if (pickerItem) logEntry(pickerItem, servings);
		pickerOpen = false;
		pickerItem = null;
	};

	onMount(() => {
		loadFavorites();
	});
</script>

{#if items.length > 0}
	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-base">{m.favorites_title()}</Card.Title>
		</Card.Header>
		<Card.Content>
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
		</Card.Content>
	</Card.Root>
{/if}

<ServingsPicker
	open={pickerOpen}
	itemName={pickerItem?.name ?? ''}
	onConfirm={handlePickerConfirm}
	onClose={() => {
		pickerOpen = false;
		pickerItem = null;
	}}
/>
