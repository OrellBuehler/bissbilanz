import { getDB } from '$lib/server/db';
import { foods, recipes } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';
import { ApiError } from '$lib/server/errors';

/**
 * Either a live DB handle or an open transaction — lets ownership checks run
 * inside an existing transaction or standalone.
 */
export type TxOrDb =
	Parameters<Parameters<ReturnType<typeof getDB>['transaction']>[0]>[0] | ReturnType<typeof getDB>;

/**
 * Verify a food belongs to the user before it can be referenced (e.g. as a log
 * entry's `foodId` or a recipe ingredient). Throws ApiError(404) otherwise.
 *
 * Without this, a client-supplied `foodId` is inserted unchecked and the
 * read-back join exposes another user's food name + macros (IDOR).
 */
export const assertFoodOwned = async (
	tx: TxOrDb,
	userId: string,
	foodId: string
): Promise<void> => {
	const [row] = await tx
		.select({ id: foods.id })
		.from(foods)
		.where(and(eq(foods.id, foodId), eq(foods.userId, userId)))
		.limit(1);
	if (!row) throw new ApiError(404, 'Food not found');
};

/**
 * Verify a recipe belongs to the user before it can be referenced as a log
 * entry's `recipeId`. Throws ApiError(404) otherwise.
 */
export const assertRecipeOwned = async (
	tx: TxOrDb,
	userId: string,
	recipeId: string
): Promise<void> => {
	const [row] = await tx
		.select({ id: recipes.id })
		.from(recipes)
		.where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId)))
		.limit(1);
	if (!row) throw new ApiError(404, 'Recipe not found');
};
