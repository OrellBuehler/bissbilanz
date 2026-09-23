import { sumEntries } from '$lib/utils/nutrition';
import { roundNutrition } from '$lib/utils/round-nutrition';
import { adjustGoalsForActivity } from '$lib/utils/activity-goals';

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

type DayProperties = {
	isFastingDay?: boolean;
	waterMl?: number | null;
	activityCalories?: number | null;
	activityNote?: string | null;
} | null;

type Preferences = {
	activityGoalAdjustment: boolean;
	activityCreditPercent: number;
} | null;

export const formatDailyStatus = ({
	entries,
	goals,
	dayProperties,
	preferences
}: {
	entries: Entry[];
	goals: Goals;
	dayProperties?: DayProperties;
	preferences?: Preferences;
}) => {
	const totals = sumEntries(entries);
	const day = dayProperties ?? null;

	// When the user has opted in, a day's activityCalories raises that day's
	// goals (see $lib/utils/activity-goals.ts). Activity calories are never
	// subtracted from intake — only the goal side moves.
	const adjustedGoals = adjustGoalsForActivity(goals, day?.activityCalories, {
		enabled: preferences?.activityGoalAdjustment ?? false,
		creditPercent: preferences?.activityCreditPercent ?? 100
	});
	const activityBonus = adjustedGoals?.activityBonus ?? 0;
	let effectiveGoals = goals;
	if (activityBonus > 0 && adjustedGoals) {
		const { activityBonus: _activityBonus, ...adjustedGoalsOnly } = adjustedGoals;
		effectiveGoals = adjustedGoalsOnly;
	}

	const progress = effectiveGoals
		? {
				calories: pct(totals.calories, effectiveGoals.calorieGoal),
				protein: pct(totals.protein, effectiveGoals.proteinGoal),
				carbs: pct(totals.carbs, effectiveGoals.carbGoal),
				fat: pct(totals.fat, effectiveGoals.fatGoal),
				fiber: pct(totals.fiber, effectiveGoals.fiberGoal)
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

	return {
		totals: roundNutrition(totals),
		goals: effectiveGoals,
		progress,
		entryCount: entries.length,
		byMeal: roundNutrition(byMeal),
		...(day?.waterMl != null ? { waterMl: day.waterMl } : {}),
		...(day?.activityCalories != null ? { activityCalories: day.activityCalories } : {}),
		...(day?.activityNote ? { activityNote: day.activityNote } : {}),
		...(day?.isFastingDay ? { isFastingDay: true } : {}),
		// Present only when the activity bonus actually changed the goals, so
		// callers can tell an adjusted day apart from a plain one.
		...(activityBonus > 0 ? { baseGoals: goals, activityBonus } : {})
	};
};
