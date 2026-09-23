import type { Goals } from '$lib/utils/insights';

export type ActivityAdjustmentOptions = {
	enabled: boolean;
	creditPercent: number;
};

export type ActivityAdjustedGoals<T> = T & { activityBonus: number };

/**
 * Raises calorieGoal (and the other macro goals proportionally) by a share of
 * the day's activityCalories. Fields outside the 5 macro goals (sodium, sugar,
 * targetWeight, ...) pass through unchanged.
 */
export function adjustGoalsForActivity<T extends Goals>(
	goals: T | null,
	activityCalories: number | null | undefined,
	{ enabled, creditPercent }: ActivityAdjustmentOptions
): ActivityAdjustedGoals<T> | null {
	if (!goals) return null;

	const calories = activityCalories ?? 0;
	if (!enabled || calories <= 0 || goals.calorieGoal <= 0) {
		return { ...goals, activityBonus: 0 };
	}

	const bonus = Math.round((calories * creditPercent) / 100);
	const factor = (goals.calorieGoal + bonus) / goals.calorieGoal;

	return {
		...goals,
		calorieGoal: goals.calorieGoal + bonus,
		proteinGoal: Math.round(goals.proteinGoal * factor),
		carbGoal: Math.round(goals.carbGoal * factor),
		fatGoal: Math.round(goals.fatGoal * factor),
		fiberGoal: Math.round(goals.fiberGoal * factor),
		activityBonus: bonus
	};
}
