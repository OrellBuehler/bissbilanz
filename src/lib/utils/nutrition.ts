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

export const roundTotals = (t: MacroTotals): MacroTotals => ({
	calories: Math.round(t.calories),
	protein: Math.round(t.protein * 10) / 10,
	carbs: Math.round(t.carbs * 10) / 10,
	fat: Math.round(t.fat * 10) / 10,
	fiber: Math.round(t.fiber * 10) / 10
});

export const scaleTotals = (t: MacroTotals, factor: number): MacroTotals => ({
	calories: t.calories * factor,
	protein: t.protein * factor,
	carbs: t.carbs * factor,
	fat: t.fat * factor,
	fiber: t.fiber * factor
});

export const calculateEntryTotals = (food: MacroTotals, servings: number): MacroTotals =>
	scaleTotals(food, servings);

export const calculateDailyTotals = (entries: MacroTotals[]): MacroTotals =>
	entries.reduce(addTotals, emptyTotals());

type NutritionEntry = {
	calories: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
	servings: number;
};

export const calculateEntryMacros = (entry: NutritionEntry): MacroTotals => ({
	calories: (entry.calories ?? 0) * entry.servings,
	protein: (entry.protein ?? 0) * entry.servings,
	carbs: (entry.carbs ?? 0) * entry.servings,
	fat: (entry.fat ?? 0) * entry.servings,
	fiber: (entry.fiber ?? 0) * entry.servings
});

export const sumEntries = (entries: NutritionEntry[]): MacroTotals =>
	entries.reduce((acc, entry) => addTotals(acc, calculateEntryMacros(entry)), emptyTotals());
