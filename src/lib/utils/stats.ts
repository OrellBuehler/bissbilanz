import { addTotals, emptyTotals, type MacroTotals } from '$lib/utils/nutrition';
import { roundNutrition } from '$lib/utils/round-nutrition';

export const averageTotals = (days: MacroTotals[]): MacroTotals => {
	if (!days.length) return emptyTotals();
	const sum = days.reduce(addTotals, emptyTotals());
	const n = days.length;
	return roundNutrition({
		calories: sum.calories / n,
		protein: sum.protein / n,
		carbs: sum.carbs / n,
		fat: sum.fat / n,
		fiber: sum.fiber / n
	});
};
