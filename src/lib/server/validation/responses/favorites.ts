import 'zod-openapi';
import { z } from 'zod';

const favoriteFoodSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string(),
		imageUrl: z.string().nullable(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		logCount: z.number().int(),
		type: z.literal('food')
	})
	.meta({ id: 'FavoriteFood' });

const favoriteRecipeSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string(),
		imageUrl: z.string().nullable(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		logCount: z.number().int(),
		totalServings: z.number(),
		type: z.literal('recipe')
	})
	.meta({ id: 'FavoriteRecipe' });

export const favoritesResponseSchema = z
	.object({
		foods: z.array(favoriteFoodSchema).optional(),
		recipes: z.array(favoriteRecipeSchema).optional()
	})
	.meta({ id: 'FavoritesResponse' });
