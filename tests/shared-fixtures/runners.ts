import {
	classifyGoalOutcome,
	summarizeGoalAdherence
} from '../../src/lib/analytics/goal-adherence';
import { adjustGoalsForActivity } from '../../src/lib/utils/activity-goals';
import { convertQuantityForMacros, type ServingUnit } from '../../src/lib/units';
import { aggregateDailyNutrientTotals } from '../../src/lib/analytics/aggregation';
import {
	caloriesPerHundredGrams,
	cookedWeightServingSize,
	gramsToServings
} from '../../src/lib/utils/recipe-yield';
import { getCurrentMealByTime, normalizeMealType, orderMealTypes } from '../../src/lib/utils/meals';

/**
 * The TypeScript side of the shared fixtures. Relative imports only, so the same
 * runners serve the vitest suite and the fixture generator (scripts/shared-fixtures),
 * which records their output as the expected values.
 */

const macroKeys = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const;

export function runRecipeMacros(input: any) {
	const foods = input.ingredients.map((ing: any, i: number) => ({ id: `f${i}`, ...ing.food }));
	const recipes = [
		{
			id: 'r',
			totalServings: input.totalServings,
			ingredients: input.ingredients.map((ing: any, i: number) => ({
				foodId: `f${i}`,
				quantity: ing.quantity,
				servingUnit: ing.servingUnit
			}))
		}
	];
	const [day] = aggregateDailyNutrientTotals(
		[{ date: '2026-01-01', mealType: 'Lunch', servings: 1, recipeId: 'r' }],
		foods,
		recipes
	);
	const perServing = Object.fromEntries(macroKeys.map((k) => [k, day[k]]));
	const total = Object.fromEntries(macroKeys.map((k) => [k, day[k] * input.totalServings]));
	return { perServing, total };
}

/** `getCurrentMealByTime` reads the wall clock, so pin the local hour around the call. */
function atLocalHour<T>(hour: number, fn: () => T): T {
	const RealDate = globalThis.Date;
	class FixedDate extends RealDate {
		constructor(...args: any[]) {
			if (args.length === 0) super(2026, 0, 15, hour, 30);
			else super(...(args as [any]));
		}
	}
	globalThis.Date = FixedDate as DateConstructor;
	try {
		return fn();
	} finally {
		globalThis.Date = RealDate;
	}
}

export function runGeneratedCase(fn: string, i: Record<string, any>): unknown {
	switch (fn) {
		case 'classifyGoalOutcome':
			return classifyGoalOutcome(i.rule, i.value, i.goal);
		case 'adjustGoalsForActivity': {
			const { activityBonus, ...goals } = adjustGoalsForActivity(i.goals, i.activityCalories, {
				enabled: i.enabled,
				creditPercent: i.creditPercent
			})!;
			return { activityBonus, goals };
		}
		case 'summarizeGoalAdherence':
			return summarizeGoalAdherence(i.days, i.goals, i.activity).macros;
		case 'convertQuantityForMacros':
			return convertQuantityForMacros(i.quantity, i.from as ServingUnit, i.to as ServingUnit);
		case 'recipeMacros':
			return runRecipeMacros(i);
		case 'cookedWeightServingSize':
			return cookedWeightServingSize(i.cookedWeight, i.totalServings);
		case 'gramsToServings':
			return gramsToServings(i.grams, i.cookedWeight, i.totalServings);
		case 'caloriesPerHundredGrams':
			return caloriesPerHundredGrams(i.calories, i.cookedWeight);
		case 'normalizeMealType':
			return normalizeMealType(i.value);
		case 'mealForHour':
			return atLocalHour(i.hour, getCurrentMealByTime);
		case 'orderMealTypes': {
			const all = orderMealTypes(i.present);
			return all.filter((m) => i.present.includes(m));
		}
		case 'orderMealTypesWithPreference': {
			const all = orderMealTypes(i.present, i.mealOrder);
			return all.filter((m) => i.present.includes(m));
		}
		default:
			throw new Error(`no web runner for fn ${fn}`);
	}
}
