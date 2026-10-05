import { describe, expect, it } from 'vitest';

import { classifyGoalOutcome, summarizeGoalAdherence } from '$lib/analytics/goal-adherence';
import { adjustGoalsForActivity } from '$lib/utils/activity-goals';
import { convertQuantityForMacros, type ServingUnit } from '$lib/units';
import {
	caloriesPerHundredGrams,
	cookedWeightServingSize,
	gramsToServings
} from '$lib/utils/recipe-yield';
import { recipeScaleFactor, scaleIngredients } from '$lib/utils/recipe-scaling';
import { isVolumeBasis, parseDecimal, parseRows } from '$lib/label-parser';
import {
	casesFor,
	diff,
	expectedFor,
	loadFixture,
	type FixtureCase,
	type FixtureFile
} from './helpers';
import { runRecipeMacros } from './runners';

/**
 * Cross-platform consistency for goal rules, recipe math and label parsing. The
 * same JSON fixtures (tests/fixtures/shared/) are asserted by the Kotlin shared
 * module (SharedFixturesTest) and the iOS app (SharedFixtureTests), so the three
 * implementations cannot drift apart unnoticed.
 */

const labelKeys = [
	'calories',
	'protein',
	'carbs',
	'fat',
	'fiber',
	'sugar',
	'saturatedFat',
	'salt',
	'sodium'
] as const;

function run(c: FixtureCase): unknown {
	const i = c.input;
	switch (c.fn) {
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
		case 'recipeScaleFactor':
			return recipeScaleFactor(
				{ totalServings: i.totalServings, cookedWeight: i.cookedWeight },
				i.amount,
				i.mode
			);
		case 'scaleIngredients':
			return scaleIngredients(i.ingredients, i.factor);
		case 'parseRows': {
			const parsed = parseRows(i.rows);
			return {
				...Object.fromEntries(labelKeys.map((k) => [k, parsed[k] ?? null])),
				isVolume: isVolumeBasis(i.rows)
			};
		}
		case 'isVolumeBasis':
			return isVolumeBasis(i.rows);
		case 'parseDecimal':
			return parseDecimal(i.token, i.energyKJ);
		default:
			throw new Error(`no web harness for fn ${c.fn}`);
	}
}

function suite(file: string, fixture: FixtureFile) {
	describe(`shared fixtures: ${file}`, () => {
		const cases = casesFor(fixture, 'web');
		it('has cases', () => expect(cases.length).toBeGreaterThan(0));
		it.each(cases.map((c) => [`${c.fn}/${c.name}`, c] as const))('%s', (_label, c) => {
			const mismatches = diff(run(c), expectedFor(c, 'web'), fixture.tolerance ?? 1e-9);
			expect(mismatches).toEqual([]);
		});
	});
}

for (const file of ['goal-rules.json', 'recipe-math.json', 'label-parsing.json']) {
	suite(file, loadFixture(file));
}
