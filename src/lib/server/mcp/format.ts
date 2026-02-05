import { sumEntries } from '$lib/utils/nutrition';

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
	const totals = sumEntries(entries);
	return { totals, goals };
};
