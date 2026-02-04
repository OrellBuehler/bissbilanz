import { getDB } from '$lib/server/db';
import { recipes, recipeIngredients } from '$lib/server/schema';
import { recipeCreateSchema } from '$lib/server/validation';
import { eq } from 'drizzle-orm';

type RecipeInput = { name: string; totalServings: number };

export const toRecipeInsert = (userId: string, input: RecipeInput) => ({
	userId,
	name: input.name,
	totalServings: input.totalServings
});

export const listRecipes = async (userId: string) => {
	const db = getDB();
	return db.select().from(recipes).where(eq(recipes.userId, userId)).orderBy(recipes.name);
};

export const createRecipe = async (userId: string, payload: unknown) => {
	const db = getDB();
	const parsed = recipeCreateSchema.parse(payload);
	const [recipe] = await db.insert(recipes).values(toRecipeInsert(userId, parsed)).returning();

	const ingredientRows = parsed.ingredients.map((ingredient, index) => ({
		recipeId: recipe.id,
		foodId: ingredient.foodId,
		quantity: ingredient.quantity,
		servingUnit: ingredient.servingUnit,
		sortOrder: index
	}));

	await db.insert(recipeIngredients).values(ingredientRows);
	return recipe;
};
