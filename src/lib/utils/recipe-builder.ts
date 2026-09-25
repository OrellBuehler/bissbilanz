import type { ServingUnit } from '$lib/units';

export type RecipeFormState = {
	name: string;
	totalServings: number;
	cookedWeight: number | null;
	ingredients: Array<{ foodId: string; quantity: number; servingUnit: ServingUnit }>;
};

export const buildRecipePayload = (state: RecipeFormState) => ({
	name: state.name,
	totalServings: state.totalServings,
	cookedWeight: state.cookedWeight ?? null,
	ingredients: state.ingredients.filter((i) => i.foodId)
});
