<script lang="ts">
	import FavoriteCard from '$lib/components/favorites/FavoriteCard.svelte';
	import FavoritesGrid from '$lib/components/favorites/FavoritesGrid.svelte';
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
	};

	let { onEntryLogged }: Props = $props();

	let items: FavoriteItem[] = $state([]);

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

	const logEntry = async (item: FavoriteItem) => {
		const meal = getCurrentMealByTime();
		const payload: Record<string, unknown> = {
			mealType: meal,
			servings: 1,
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

		const { entry } = await res.json();

		toast.info(m.favorites_logged_toast({ name: item.name, meal }), {
			action: {
				label: m.favorites_undo(),
				onClick: async () => {
					await apiFetch(`/api/entries/${entry.id}`, { method: 'DELETE' });
					onEntryLogged();
				}
			},
			duration: 5000
		});

		onEntryLogged();
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
						onTap={() => logEntry(item)}
					/>
				{/each}
			</FavoritesGrid>
		</Card.Content>
	</Card.Root>
{/if}
