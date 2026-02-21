export const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;
export type DefaultMealType = (typeof DEFAULT_MEAL_TYPES)[number];

export const mergeMealTypes = (defaults: string[], custom: string[]) => {
	return [...defaults, ...custom];
};

export const getCurrentMealByTime = (): string => {
	const hour = new Date().getHours();
	if (hour < 11) return 'Breakfast';
	if (hour < 15) return 'Lunch';
	if (hour < 18) return 'Snacks';
	return 'Dinner';
};
