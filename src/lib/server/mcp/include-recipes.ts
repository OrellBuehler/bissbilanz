import { z } from 'zod';

export const MAX_INCLUDED_RECIPES = 20;
export const MAX_RECIPE_INGREDIENTS = 100;

export const includeRecipesSchema = z
	.array(
		z
			.object({
				recipeId: z.string().uuid(),
				servings: z.coerce.number().positive().optional(),
				grams: z.coerce.number().positive().optional()
			})
			.refine((v) => (v.servings === undefined) !== (v.grams === undefined), {
				message: 'Provide exactly one of servings or grams'
			})
	)
	.max(MAX_INCLUDED_RECIPES);

export type IncludeRecipes = z.infer<typeof includeRecipesSchema>;

export const INCLUDE_RECIPES_DOC =
	'Optional list of existing recipes to fold into this one, each { recipeId, servings } or { recipeId, grams } (exactly one of the two; up to 20). ' +
	"The source recipe's ingredients are copied in, scaled to that many servings of it, or to that many grams of its cooked weight (the source needs a cookedWeight for grams). " +
	'Use this to build a meal-prep box or combined dish from an existing recipe plus extra ingredients instead of copying ingredients by hand: ' +
	'pass the extras in ingredients and the existing recipe in includeRecipes. ' +
	'The ingredients are copied as a snapshot, so later edits to the source recipe do not change this one. The combined ingredient list may hold at most 100 rows.';
