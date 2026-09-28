import 'zod-openapi';
import { z } from 'zod';

const usageEntrySchema = z
	.object({
		id: z.string().uuid(),
		date: z.string(),
		mealType: z.string(),
		servings: z.number(),
		eatenAt: z.string()
	})
	.meta({ id: 'UsageEntry' });

const foodUsageRecipeSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string(),
		// The food is the recipe's only ingredient, so it cannot be removed.
		isLastIngredient: z.boolean()
	})
	.meta({ id: 'FoodUsageRecipe' });

const foodUsageSupplementSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string()
	})
	.meta({ id: 'FoodUsageSupplement' });

export const recipeUsageResponseSchema = z
	.object({
		// Diary entries logging the recipe, newest first, capped at 200.
		entries: z.array(usageEntrySchema),
		// All matching entries; exceeds entries.length when the list is capped.
		totalEntries: z.number().int()
	})
	.meta({ id: 'RecipeUsageResponse' });

export const foodUsageResponseSchema = z
	.object({
		entries: z.array(usageEntrySchema),
		totalEntries: z.number().int(),
		recipes: z.array(foodUsageRecipeSchema),
		supplements: z.array(foodUsageSupplementSchema)
	})
	.meta({ id: 'FoodUsageResponse' });
