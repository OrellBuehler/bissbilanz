export type MacroTotals = {
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
};

export const emptyTotals = (): MacroTotals => ({
	calories: 0,
	protein: 0,
	carbs: 0,
	fat: 0,
	fiber: 0
});

export const addTotals = (a: MacroTotals, b: MacroTotals): MacroTotals => ({
	calories: a.calories + b.calories,
	protein: a.protein + b.protein,
	carbs: a.carbs + b.carbs,
	fat: a.fat + b.fat,
	fiber: a.fiber + b.fiber
});

export const scaleTotals = (t: MacroTotals, factor: number): MacroTotals => ({
	calories: t.calories * factor,
	protein: t.protein * factor,
	carbs: t.carbs * factor,
	fat: t.fat * factor,
	fiber: t.fiber * factor
});

export const calculateEntryTotals = (
	food: MacroTotals,
	servings: number
): MacroTotals => scaleTotals(food, servings);

export const calculateDailyTotals = (entries: MacroTotals[]): MacroTotals =>
	entries.reduce(addTotals, emptyTotals());
