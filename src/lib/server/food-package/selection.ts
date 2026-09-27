import { and, asc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { getDB } from '$lib/server/db';
import { foodLabels, foods, recipeIngredients, recipes } from '$lib/server/schema';
import { foodColumnsWithLabels } from '$lib/server/food-labels';
import { normalizeLabels } from '$lib/server/labels';
import { ApiError } from '$lib/server/errors';
import { collect } from '$lib/server/db-chunks';
import type { FoodPackageSelection } from '$lib/server/validation/food-package';
import { MAX_PACKAGE_FOODS, MAX_PACKAGE_RECIPES } from './format';

export type SelectedFood = typeof foods.$inferSelect & {
	labels: string[];
	role: 'selected' | 'ingredient';
};
export type SelectedRecipe = typeof recipes.$inferSelect;
export type SelectedIngredient = typeof recipeIngredients.$inferSelect;

export type PackageSelection = {
	foods: SelectedFood[];
	recipes: SelectedRecipe[];
	ingredients: SelectedIngredient[];
};

/**
 * Turn an export request into the rows that go into the package.
 *
 * Foods: `all`, or the union of `foodIds` and every food whose brand OR labels
 * match the filter. Only kind=food rows of the caller count — supplements are
 * personal, and an id belonging to someone else simply matches nothing.
 *
 * Recipes: `recipeIds`, plus every recipe (`includeRecipes: 'all'`) or the ones
 * using a selected food (`'related'`). An exported recipe always drags its
 * ingredient foods along (role `ingredient`), or it could not be rebuilt.
 */
export async function resolvePackageSelection(
	userId: string,
	selection: FoodPackageSelection
): Promise<PackageSelection> {
	const db = getDB();
	const includeRecipes = selection.includeRecipes ?? (selection.all ? 'all' : 'none');

	const ownFood = and(eq(foods.userId, userId), eq(foods.kind, 'food'));
	let foodFilter: SQL | undefined;
	if (selection.all) {
		foodFilter = ownFood;
	} else {
		const any: SQL[] = [];
		if (selection.foodIds?.length) any.push(inArray(foods.id, selection.foodIds));
		const brands = [...new Set((selection.brands ?? []).map((b) => b.trim().toLowerCase()))];
		if (brands.length) any.push(inArray(sql`lower(btrim(${foods.brand}))`, brands));
		const labels = normalizeLabels(selection.labels ?? []);
		if (labels.length) {
			any.push(
				inArray(
					foods.id,
					db
						.select({ id: foodLabels.foodId })
						.from(foodLabels)
						.where(and(eq(foodLabels.userId, userId), inArray(foodLabels.label, labels)))
				)
			);
		}
		if (any.length) foodFilter = and(ownFood, or(...any));
	}

	const selectedFoods = foodFilter
		? await db
				.select(foodColumnsWithLabels)
				.from(foods)
				.where(foodFilter)
				.orderBy(asc(foods.name), asc(foods.id))
				.limit(MAX_PACKAGE_FOODS + 1)
		: [];
	if (selectedFoods.length > MAX_PACKAGE_FOODS) {
		throw new ApiError(413, `A package can hold at most ${MAX_PACKAGE_FOODS} foods`);
	}
	const selectedFoodIds = new Set(selectedFoods.map((food) => food.id));

	const recipeFilters: SQL[] = [];
	if (includeRecipes === 'all') recipeFilters.push(sql`true`);
	if (selection.recipeIds?.length) recipeFilters.push(inArray(recipes.id, selection.recipeIds));
	if (includeRecipes === 'related' && selectedFoodIds.size > 0) {
		const related = await collect([...selectedFoodIds], (part) =>
			db
				.selectDistinct({ id: recipeIngredients.recipeId })
				.from(recipeIngredients)
				.where(inArray(recipeIngredients.foodId, part))
		);
		if (related.length) {
			recipeFilters.push(
				inArray(
					recipes.id,
					related.map((row) => row.id)
				)
			);
		}
	}

	const selectedRecipes = recipeFilters.length
		? await db
				.select()
				.from(recipes)
				.where(and(eq(recipes.userId, userId), or(...recipeFilters)))
				.orderBy(asc(recipes.name), asc(recipes.id))
				.limit(MAX_PACKAGE_RECIPES + 1)
		: [];
	if (selectedRecipes.length > MAX_PACKAGE_RECIPES) {
		throw new ApiError(413, `A package can hold at most ${MAX_PACKAGE_RECIPES} recipes`);
	}

	const ingredients = selectedRecipes.length
		? await collect(
				selectedRecipes.map((recipe) => recipe.id),
				(part) =>
					db
						.select()
						.from(recipeIngredients)
						.where(inArray(recipeIngredients.recipeId, part))
						.orderBy(asc(recipeIngredients.recipeId), asc(recipeIngredients.sortOrder))
			)
		: [];

	const missing = [
		...new Set(ingredients.map((row) => row.foodId).filter((id) => !selectedFoodIds.has(id)))
	];
	const closure = missing.length
		? await collect(missing, (part) =>
				db
					.select(foodColumnsWithLabels)
					.from(foods)
					.where(and(eq(foods.userId, userId), inArray(foods.id, part)))
			)
		: [];

	const all: SelectedFood[] = [
		...selectedFoods.map((food) => ({ ...food, role: 'selected' as const })),
		...closure.map((food) => ({ ...food, role: 'ingredient' as const }))
	];
	if (all.length > MAX_PACKAGE_FOODS) {
		throw new ApiError(413, `A package can hold at most ${MAX_PACKAGE_FOODS} foods`);
	}

	return { foods: all, recipes: selectedRecipes, ingredients };
}
