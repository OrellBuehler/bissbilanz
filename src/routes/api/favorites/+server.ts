import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFavoriteFoods, listFavoriteRecipes } from '$lib/server/favorites';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const type = url.searchParams.get('type');
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100) : 50;

		if (type === 'foods') {
			const foods = await listFavoriteFoods(userId, limit);
			return json({ foods });
		}

		if (type === 'recipes') {
			const recipes = await listFavoriteRecipes(userId, limit);
			return json({ recipes });
		}

		// Default: return both
		const [foods, recipes] = await Promise.all([
			listFavoriteFoods(userId, limit),
			listFavoriteRecipes(userId, limit)
		]);

		return json({ foods, recipes });
	} catch (error) {
		return handleApiError(error);
	}
};
