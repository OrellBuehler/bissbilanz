import { convertQuantityForMacros, unitDimension, type ServingUnit } from '../units';

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

export type RecipeServingAmount = { amount: number; unit: 'g' | 'ml'; estimated: boolean };

/**
 * What one serving of a recipe weighs or measures. The cooked weight gives an
 * exact grams figure; without one, the ingredient amounts are summed in grams
 * (mass units) or millilitres (volume units, counted as grams when mixed with
 * mass) and divided by the total servings, flagged as an estimate. Null when
 * neither is available.
 */
export const recipeServingAmount = (
	cookedWeight: number | null | undefined,
	totalServings: number | null | undefined,
	ingredients: readonly { quantity: number; servingUnit: ServingUnit }[] | null | undefined
): RecipeServingAmount | null => {
	if (!totalServings || totalServings <= 0) return null;
	const exact = cookedWeightServingSize(cookedWeight, totalServings);
	if (exact !== null) return { amount: exact, unit: 'g', estimated: false };
	if (!ingredients?.length) return null;
	let total = 0;
	let allVolume = true;
	for (const { quantity, servingUnit } of ingredients) {
		const volume = unitDimension(servingUnit) === 'volume';
		if (!volume) allVolume = false;
		total += convertQuantityForMacros(quantity, servingUnit, volume ? 'ml' : 'g');
	}
	if (!(total > 0)) return null;
	return { amount: total / totalServings, unit: allVolume ? 'ml' : 'g', estimated: true };
};
