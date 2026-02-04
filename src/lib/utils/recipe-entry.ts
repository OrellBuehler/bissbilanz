export const toRecipeEntryPayload = (input: {
	recipeId: string;
	mealType: string;
	servings: number;
}) => ({
	recipeId: input.recipeId,
	mealType: input.mealType,
	servings: input.servings
});
