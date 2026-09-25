/**
 * Grams per serving implied by a recipe's cooked weight, for feeding an
 * `AmountInput`-style `servingSize`/`servingUnit` pair (unit = 'g') so a
 * recipe can be logged by weight instead of by serving count. `servings =
 * grams / servingSize`, matching `AmountInput`'s existing unit-mode math.
 */
export const cookedWeightServingSize = (
	cookedWeight: number | null | undefined,
	totalServings: number | null | undefined
): number | null => {
	if (!cookedWeight || cookedWeight <= 0) return null;
	if (!totalServings || totalServings <= 0) return null;
	return cookedWeight / totalServings;
};

/**
 * Servings implied by a target weight in grams, given a recipe's cooked
 * weight and total servings — the inverse of `cookedWeightServingSize`,
 * spelled out explicitly for callers that already have the target grams
 * rather than going through `AmountInput`.
 */
export const gramsToServings = (
	grams: number,
	cookedWeight: number | null | undefined,
	totalServings: number | null | undefined
): number | null => {
	const servingSize = cookedWeightServingSize(cookedWeight, totalServings);
	if (!servingSize || grams <= 0) return null;
	return grams / servingSize;
};

/** Calories per 100 g of the finished dish, or null when there's no cooked weight. */
export const caloriesPerHundredGrams = (
	calories: number,
	cookedWeight: number | null | undefined
): number | null => {
	if (!cookedWeight || cookedWeight <= 0) return null;
	return (calories / cookedWeight) * 100;
};
