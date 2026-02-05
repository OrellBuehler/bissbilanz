import type { MacroTotals } from '$lib/utils/nutrition';

export const averageTotals = (days: MacroTotals[]): MacroTotals => {
	if (!days.length) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
	const sum = days.reduce(
		(acc, day) => ({
			calories: acc.calories + day.calories,
			protein: acc.protein + day.protein,
			carbs: acc.carbs + day.carbs,
			fat: acc.fat + day.fat,
			fiber: acc.fiber + day.fiber
		}),
		{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
	);
	return {
		calories: sum.calories / days.length,
		protein: sum.protein / days.length,
		carbs: sum.carbs / days.length,
		fat: sum.fat / days.length,
		fiber: sum.fiber / days.length
	};
};
