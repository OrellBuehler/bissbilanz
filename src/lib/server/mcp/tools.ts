import { z } from 'zod';

export const toolNames = [
	'get-daily-status',
	'create-food',
	'create-recipe',
	'log-food',
	'search-foods'
] as const;

export const createFoodInput = z.object({
	name: z.string(),
	brand: z.string().optional(),
	servingSize: z.number(),
	servingUnit: z.string(),
	calories: z.number(),
	protein: z.number(),
	carbs: z.number(),
	fat: z.number(),
	fiber: z.number(),
	barcode: z.string().optional()
});

export const createRecipeInput = z.object({
	name: z.string(),
	totalServings: z.number(),
	ingredients: z.array(
		z.object({
			foodId: z.string(),
			quantity: z.number(),
			servingUnit: z.string()
		})
	)
});

export const logFoodInput = z.object({
	foodId: z.string().optional(),
	recipeId: z.string().optional(),
	mealType: z.string(),
	servings: z.number(),
	notes: z.string().optional(),
	date: z.string().optional()
});

export const searchFoodsInput = z.object({ query: z.string() });
