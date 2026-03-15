import { sumEntries } from '$lib/utils/nutrition';

type Entry = {
	calories: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
	servings: number;
	mealType?: string;
};

type Goals = {
	calorieGoal: number;
	proteinGoal: number;
	carbGoal: number;
	fatGoal: number;
	fiberGoal: number;
} | null;

function pct(consumed: number, goal: number): number {
	if (goal <= 0) return 0;
	return Math.round((consumed / goal) * 100);
}

export const formatDailyStatus = ({ entries, goals }: { entries: Entry[]; goals: Goals }) => {
	const totals = sumEntries(entries);

	const progress = goals
		? {
				calories: pct(totals.calories, goals.calorieGoal),
				protein: pct(totals.protein, goals.proteinGoal),
				carbs: pct(totals.carbs, goals.carbGoal),
				fat: pct(totals.fat, goals.fatGoal),
				fiber: pct(totals.fiber, goals.fiberGoal)
			}
		: null;

	const byMeal: Record<
		string,
		{ calories: number; protein: number; carbs: number; fat: number; fiber: number }
	> = {};
	for (const entry of entries) {
		const meal = entry.mealType ?? 'Other';
		if (!byMeal[meal]) byMeal[meal] = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
		byMeal[meal].calories += (entry.calories ?? 0) * entry.servings;
		byMeal[meal].protein += (entry.protein ?? 0) * entry.servings;
		byMeal[meal].carbs += (entry.carbs ?? 0) * entry.servings;
		byMeal[meal].fat += (entry.fat ?? 0) * entry.servings;
		byMeal[meal].fiber += (entry.fiber ?? 0) * entry.servings;
	}

	return { totals, goals, progress, entryCount: entries.length, byMeal };
};
