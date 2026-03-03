/**
 * Centralized color constants for macro nutrients and meals.
 * Follows the project convention: Calories=Blue, Protein=Red, Carbs=Orange, Fat=Yellow, Fiber=Green
 */
export const MACRO_COLORS = {
	calories: '#3B82F6',
	protein: '#EF4444',
	carbs: '#F97316',
	fat: '#EAB308',
	fiber: '#22C55E'
} as const;

export const MEAL_COLORS: Record<string, string> = {
	Breakfast: '#F59E0B',
	Lunch: '#3B82F6',
	Dinner: '#8B5CF6',
	Snacks: '#10B981'
};
