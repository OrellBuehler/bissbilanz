import type { MacroTotals } from '$lib/utils/nutrition';

export type IngredientTotals = MacroTotals & { quantity: number };

export const calculateRecipeTotals = (
	ingredients: IngredientTotals[],
	totalServings: number
): MacroTotals => {
	const totals = ingredients.reduce<MacroTotals>(
		(acc, item) => ({
			calories: acc.calories + item.calories * item.quantity,
			protein: acc.protein + item.protein * item.quantity,
			carbs: acc.carbs + item.carbs * item.quantity,
			fat: acc.fat + item.fat * item.quantity,
			fiber: acc.fiber + item.fiber * item.quantity
		}),
		{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
	);

	return {
		calories: totals.calories / totalServings,
		protein: totals.protein / totalServings,
		carbs: totals.carbs / totalServings,
		fat: totals.fat / totalServings,
		fiber: totals.fiber / totalServings
	};
};
