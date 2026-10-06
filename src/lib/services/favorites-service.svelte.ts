import { liveQuery } from 'dexie';
import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { api } from '$lib/api/client';

function favorites() {
	return liveQuery(async () => {
		const foods = await db.foods.where('favKey').equals(1).toArray();
		const recipes = await db.recipes.filter((r) => r.isFavorite).toArray();
		return { foods, recipes };
	});
}

async function refresh() {
	try {
		const { data } = await api.GET('/api/favorites');
		if (!data) return;

		const serverFoodIds = Array.isArray(data.foods) ? data.foods.map((fav) => fav.id) : [];
		const serverRecipeIds = Array.isArray(data.recipes) ? data.recipes.map((fav) => fav.id) : [];

		// Only touch rows whose flag actually changes: an account can hold 100k
		// foods, and rewriting every row to clear the flag would not scale.
		await db.transaction('rw', db.foods, db.recipes, async () => {
			const favoriteFoodIds = new Set(
				(await db.foods.where('favKey').equals(1).primaryKeys()) as string[]
			);
			const serverFoods = new Set(serverFoodIds);
			const unfavorite = [...favoriteFoodIds].filter((id) => !serverFoods.has(id));
			const favorite = serverFoodIds.filter((id) => !favoriteFoodIds.has(id));
			await db.foods.where('id').anyOf(unfavorite).modify({ isFavorite: false });
			await db.foods.where('id').anyOf(favorite).modify({ isFavorite: true });

			await db.recipes.toCollection().modify({ isFavorite: false });
			for (const id of serverRecipeIds) {
				await db.recipes
					.update(id, { isFavorite: true })
					.catch((err) => Sentry.captureException(err, { level: 'warning' }));
			}
		});
	} catch (err) {
		// fire-and-forget
		if (!(browser && !navigator.onLine)) {
			Sentry.captureException(err, { extra: { context: 'favorites-service.refresh' } });
		}
	}
}

export const favoritesService = {
	favorites,
	refresh
};
