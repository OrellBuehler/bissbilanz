import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFavoriteFoods, listFavoriteRecipes } from '$lib/server/favorites';
import { paginationSchema } from '$lib/server/validation';
import { handleApiError, requireAuth, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const type = url.searchParams.get('type');
		const paginationResult = paginationSchema.safeParse({
			limit: url.searchParams.get('limit'),
			offset: url.searchParams.get('offset')
		});
		if (!paginationResult.success) {
			return validationError(paginationResult.error);
		}
		const { limit } = paginationResult.data;

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
