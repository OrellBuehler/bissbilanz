export type RecipeFormState = {
	name: string;
	totalServings: number;
	ingredients: Array<{ foodId: string; quantity: number; servingUnit: string }>;
};

export const buildRecipePayload = (state: RecipeFormState) => ({
	name: state.name,
	totalServings: state.totalServings,
	ingredients: state.ingredients.filter((i) => i.foodId)
});
