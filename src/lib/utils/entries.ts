export type EntryListItem = {
	id: string;
	mealType: string;
	calories: number;
	protein?: number;
	carbs?: number;
	fat?: number;
	fiber?: number;
};

export const groupEntriesByMeal = (entries: EntryListItem[]) => {
	return entries.reduce<Record<string, EntryListItem[]>>((acc, entry) => {
		acc[entry.mealType] ??= [];
		acc[entry.mealType].push(entry);
		return acc;
	}, {});
};
