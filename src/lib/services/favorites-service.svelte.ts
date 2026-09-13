import { liveQuery } from 'dexie';
import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { api } from '$lib/api/client';

function favorites() {
	return liveQuery(async () => {
		const foods = await db.foods.filter((f) => f.isFavorite).toArray();
		const recipes = await db.recipes.filter((r) => r.isFavorite).toArray();
		return { foods, recipes };
	});
}

async function refresh() {
	try {
		const { data } = await api.GET('/api/favorites');
		if (!data) return;

		await db.transaction('rw', db.foods, db.recipes, async () => {
			await db.foods.toCollection().modify({ isFavorite: false });
			await db.recipes.toCollection().modify({ isFavorite: false });

			if (Array.isArray(data.foods)) {
				for (const fav of data.foods) {
					await db.foods.update(fav.id, { isFavorite: true }).catch(() => {});
				}
			}
			if (Array.isArray(data.recipes)) {
				for (const fav of data.recipes) {
					await db.recipes.update(fav.id, { isFavorite: true }).catch(() => {});
				}
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
