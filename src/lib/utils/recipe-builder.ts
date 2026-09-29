import type { ServingUnit } from '$lib/units';
import { buildStepsPayload, type StepDraft } from '$lib/utils/recipe-steps';

export type RecipeFormState = {
	name: string;
	totalServings: number;
	cookedWeight: number | null;
	ingredients: Array<{ foodId: string; quantity: number; servingUnit: ServingUnit }>;
	// `null` = the steps are not loaded (offline, never downloaded): leave them out
	// of the payload so a save does not clear them on the server.
	steps?: StepDraft[] | null;
};

export const buildRecipePayload = (state: RecipeFormState) => ({
	name: state.name,
	totalServings: state.totalServings,
	cookedWeight: state.cookedWeight ?? null,
	ingredients: state.ingredients.filter((i) => i.foodId),
	...(state.steps ? { steps: buildStepsPayload(state.steps) } : {})
});
