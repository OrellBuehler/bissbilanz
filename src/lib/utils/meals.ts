export const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;
export type DefaultMealType = (typeof DEFAULT_MEAL_TYPES)[number];
