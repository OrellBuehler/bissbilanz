type Entry = {
	calories: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
	servings: number;
};

type Goals = {
	calorieGoal: number;
	proteinGoal: number;
	carbGoal: number;
	fatGoal: number;
	fiberGoal: number;
} | null;

export const formatDailyStatus = ({ entries, goals }: { entries: Entry[]; goals: Goals }) => {
	const totals = entries.reduce(
		(acc, entry) => ({
			calories: acc.calories + (entry.calories ?? 0) * entry.servings,
			protein: acc.protein + (entry.protein ?? 0) * entry.servings,
			carbs: acc.carbs + (entry.carbs ?? 0) * entry.servings,
			fat: acc.fat + (entry.fat ?? 0) * entry.servings,
			fiber: acc.fiber + (entry.fiber ?? 0) * entry.servings
		}),
		{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
	);
	return { totals, goals };
};
