import { getDB } from '$lib/server/db';
import { recipes, recipeIngredients } from '$lib/server/schema';
import { recipeCreateSchema, recipeUpdateSchema } from '$lib/server/validation';
import { and, eq } from 'drizzle-orm';

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

export const getRecipe = async (userId: string, id: string) => {
	const db = getDB();
	const [recipe] = await db
		.select()
		.from(recipes)
		.where(and(eq(recipes.id, id), eq(recipes.userId, userId)));

	if (!recipe) return null;

	const ingredients = await db
		.select()
		.from(recipeIngredients)
		.where(eq(recipeIngredients.recipeId, id))
		.orderBy(recipeIngredients.sortOrder);

	return { ...recipe, ingredients };
};

export const updateRecipe = async (userId: string, id: string, payload: unknown) => {
	const db = getDB();
	const parsed = recipeUpdateSchema.parse(payload);
	const { ingredients, ...recipeData } = parsed;

	const [recipe] = await db
		.update(recipes)
		.set({ ...recipeData, updatedAt: new Date() })
		.where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
		.returning();

	if (ingredients) {
		await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
		const rows = ingredients.map((ingredient, index) => ({
			recipeId: id,
			foodId: ingredient.foodId,
			quantity: ingredient.quantity,
			servingUnit: ingredient.servingUnit,
			sortOrder: index
		}));
		await db.insert(recipeIngredients).values(rows);
	}

	return recipe;
};

export const deleteRecipe = async (userId: string, id: string) => {
	const db = getDB();
	await db.delete(recipes).where(and(eq(recipes.id, id), eq(recipes.userId, userId)));
};
