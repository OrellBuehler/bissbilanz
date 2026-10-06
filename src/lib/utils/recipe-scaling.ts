export type ScalingSource = { totalServings: number; cookedWeight: number | null };

export type ScalableIngredient = { foodId: string; quantity: number; servingUnit: string };

export const recipeScaleFactor = (
	source: ScalingSource,
	amount: number,
	mode: 'servings' | 'grams'
): number | null => {
	if (!(amount > 0)) return null;
	const divisor = mode === 'servings' ? source.totalServings : source.cookedWeight;
	if (divisor == null || !(divisor > 0)) return null;
	return amount / divisor;
};

export const scaleIngredients = <T extends ScalableIngredient>(
	ingredients: T[],
	factor: number
): T[] =>
	ingredients.map((i) => ({
		...i,
		quantity: Math.max(0.01, Math.round(i.quantity * factor * 100) / 100)
	}));

export const excludeRecipe = <T extends { id: string }>(
	recipes: T[],
	excludeId: string | null | undefined
): T[] => (excludeId ? recipes.filter((r) => r.id !== excludeId) : recipes);
