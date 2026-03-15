import { liveQuery } from 'dexie';
import { db } from '$lib/db';
import { api } from '$lib/api/client';

function favorites() {
	return liveQuery(async () => {
		const foods = await db.foods.where('isFavorite').equals(1).toArray();
		const recipes = await db.recipes.where('isFavorite').equals(1).toArray();
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
	} catch {
		// fire-and-forget
	}
}

export const favoritesService = {
	favorites,
	refresh
};
