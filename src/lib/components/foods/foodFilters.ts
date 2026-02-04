export const filterFoods = <T extends { name: string; brand?: string | null }>(
	foods: T[],
	query: string
) => {
	const q = query.trim().toLowerCase();
	if (!q) return foods;
	return foods.filter((food) =>
		food.name.toLowerCase().includes(q) || (food.brand ?? '').toLowerCase().includes(q)
	);
};
