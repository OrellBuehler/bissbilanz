import { adjustGoalsForActivity, type ActivityAdjustmentOptions } from '../utils/activity-goals';
import type { DayRow, Goals, MacroKey } from '../utils/insights';

/**
 * How a day's intake is judged against its goal. Shared with the mobile apps
 * (mobile/shared/.../analytics/GoalAdherence.kt) and locked by golden vectors.
 * - minimum: meeting or exceeding the goal counts (protein, fiber)
 * - maximum: staying at or under the goal counts (carbs, fat)
 * - range: within ±GOAL_RANGE_TOLERANCE of the goal counts (calories)
 */
export type GoalRule = 'minimum' | 'maximum' | 'range';
export type GoalOutcome = 'below' | 'met' | 'above';

export const GOAL_RANGE_TOLERANCE = 0.1;

export const GOAL_RULES: Record<MacroKey, GoalRule> = {
	calories: 'range',
	protein: 'minimum',
	carbs: 'maximum',
	fat: 'maximum',
	fiber: 'minimum'
};

export function classifyGoalOutcome(
	rule: GoalRule,
	value: number,
	goal: number
): GoalOutcome | null {
	if (!(goal > 0)) return null;
	switch (rule) {
		case 'minimum':
			return value >= goal ? 'met' : 'below';
		case 'maximum':
			return value <= goal ? 'met' : 'above';
		case 'range':
			if (value < goal * (1 - GOAL_RANGE_TOLERANCE)) return 'below';
			if (value > goal * (1 + GOAL_RANGE_TOLERANCE)) return 'above';
			return 'met';
	}
}

export type MacroAdherence = {
	key: MacroKey;
	rule: GoalRule;
	below: number;
	met: number;
	above: number;
	eligible: number;
};

export type GoalAdherenceSummary = {
	macros: MacroAdherence[];
	met: number;
	eligible: number;
};

const GOAL_KEYS: Record<MacroKey, keyof Goals> = {
	calories: 'calorieGoal',
	protein: 'proteinGoal',
	carbs: 'carbGoal',
	fat: 'fatGoal',
	fiber: 'fiberGoal'
};

/**
 * Counts, per macro, how many days with entries fell below/met/above that
 * day's effective (activity-adjusted) goal. Days without entries are not
 * eligible; macros without a goal are omitted.
 */
export function summarizeGoalAdherence(
	days: DayRow[],
	goals: Goals,
	activity: ActivityAdjustmentOptions
): GoalAdherenceSummary {
	const eligibleDays = days.filter((d) => d.calories > 0);
	const effective = eligibleDays.map((d) =>
		adjustGoalsForActivity(goals, d.activityCalories ?? null, activity)
	);
	const macros: MacroAdherence[] = [];
	for (const key of Object.keys(GOAL_RULES) as MacroKey[]) {
		if (!(goals[GOAL_KEYS[key]] > 0)) continue;
		const rule = GOAL_RULES[key];
		const row: MacroAdherence = { key, rule, below: 0, met: 0, above: 0, eligible: 0 };
		eligibleDays.forEach((day, i) => {
			const outcome = classifyGoalOutcome(rule, day[key], effective[i]?.[GOAL_KEYS[key]] ?? 0);
			if (!outcome) return;
			row[outcome]++;
			row.eligible++;
		});
		macros.push(row);
	}
	return {
		macros,
		met: macros.reduce((s, r) => s + r.met, 0),
		eligible: macros.reduce((s, r) => s + r.eligible, 0)
	};
}
